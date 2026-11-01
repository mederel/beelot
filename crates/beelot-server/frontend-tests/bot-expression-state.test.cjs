const test = require("node:test");
const assert = require("node:assert/strict");
const { botEvents, expressionsFor, isThinking } = require("../static/bot-reactions.js");
const { createBotExpressionState, BOT_EXPRESSION_MS } = require("../static/bot-expression-state.js");

const NS = "North–South";
const EW = "East–West";
const BOTS = new Set(["Camille", "Luc", "Manon", "Hugo"]);
const isBot = (name) => BOTS.has(name);

function board(overrides = {}) {
  return {
    seats: [
      { name: "Ana", team: NS },
      { name: "Camille", team: EW },
      { name: "Luc", team: NS },
      { name: "Manon", team: EW },
    ],
    completedTricks: 2,
    reviewingCompletedTrick: false,
    trickWinner: "",
    trickPoints: 0,
    coinched: false,
    declaringPlayerIndex: 0,
    dealerIndex: 3,
    roundResult: null,
    activePlayerIndex: 1,
    currentPlayerIndex: 0,
    ...overrides,
  };
}

function harness() {
  let nextTimer = 0;
  const timers = new Map();
  const writes = [];
  const state = createBotExpressionState({
    isBot,
    setExpression: (prefix, seat, expression) => writes.push({ prefix, seat, expression }),
    botEvents,
    expressionsFor,
    isThinking,
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const latest = (prefix, seat) => writes.findLast((item) => item.prefix === prefix && item.seat === seat)?.expression;
  const fireTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach(({ callback }) => callback());
  };
  return { state, timers, writes, latest, fireTimers };
}

test("initial board and reload do not replay events; active bot thinks", () => {
  const { state, latest } = harness();
  const first = board({ reviewingCompletedTrick: true, trickWinner: "Manon", trickPoints: 25 });
  state.reset("table-one");
  assert.deepEqual(state.updateBoard("bot", first, { complete: false }), []);
  assert.equal(latest("bot", 3), "neutral");

  const reloaded = harness();
  reloaded.state.reset("table-one");
  assert.deepEqual(reloaded.state.updateBoard("bot", first, { complete: false }), []);
  assert.equal(reloaded.latest("bot", 3), "neutral");

  const waiting = board({ reviewingCompletedTrick: false, activePlayerIndex: 2 });
  state.updateBoard("bot", waiting, { complete: false });
  assert.equal(latest("bot", 2), "thinking");
});

test("new board events replace expressions and their timers, then restore thinking", () => {
  const { state, timers, latest, fireTimers } = harness();
  state.reset("table-one");
  state.updateBoard("bot", board(), { complete: false });
  const firstTrick = board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Manon", trickPoints: 12 });
  assert.deepEqual(state.updateBoard("bot", firstTrick, { complete: false }), [
    { type: "trick", seat: 3, big: false }
  ]);
  assert.equal(latest("bot", 3), "pleased");
  assert.equal(timers.size, 2);
  for (const timer of timers.values()) assert.equal(timer.delay, BOT_EXPRESSION_MS);
  assert.deepEqual(state.updateBoard("bot", firstTrick, { complete: false }), []);
  assert.equal(timers.size, 2);

  const nextTrick = board({ completedTricks: 4, reviewingCompletedTrick: true, trickWinner: "Luc", trickPoints: 22 });
  state.updateBoard("bot", nextTrick, { complete: false });
  assert.equal(latest("bot", 1), "annoyed");
  assert.equal(latest("bot", 2), "celebrating");
  state.updateBoard("bot", board({ completedTricks: 4, activePlayerIndex: 1 }), { complete: false });
  fireTimers();
  assert.equal(latest("bot", 1), "thinking");
  assert.equal(latest("bot", 2), "neutral");
});

test("redraws and viewer rotation preserve absolute-seat expressions; changed occupants cancel timers", () => {
  const { state, timers, writes, latest, fireTimers } = harness();
  state.reset("table-one");
  state.updateBoard("bot", board(), { complete: false });
  state.updateBoard("bot", board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Luc" }), { complete: false });
  assert.equal(latest("bot", 2), "pleased");

  const rotated = board({ currentPlayerIndex: 2 });
  state.setSeats("bidding", rotated.seats);
  assert.equal(latest("bidding", 2), "pleased");
  assert.equal(timers.size, 1);

  const changedSeat = rotated.seats.map((seat, index) => index === 0
    ? { ...seat, name: "Camille" }
    : index === 2 ? { ...seat, name: "Ana" } : seat);
  state.setSeats("bidding", changedSeat);
  assert.equal(timers.size, 0);
  assert.equal(latest("bidding", 0), "neutral");
  const seatWritesBeforeTimer = writes.filter((item) => item.prefix === "bidding" && item.seat === 2).length;
  fireTimers();
  assert.equal(writes.filter((item) => item.prefix === "bidding" && item.seat === 2).length, seatWritesBeforeTimer);
});

test("auction coinche emits once and the board transition does not duplicate it", () => {
  const { state, latest, timers } = harness();
  state.reset("table-one");
  const seats = board().seats;
  const bidding = {
    auctionId: "auction-one",
    dealerIndex: 3,
    round: 1,
    activePlayer: "Camille",
    complete: false,
    auction: [{ playerName: "Manon", call: "90 Hearts" }],
  };
  assert.deepEqual(state.updateBidding("bidding", seats, bidding), []);
  assert.equal(latest("bidding", 1), "thinking");

  const coinched = {
    ...bidding,
    auction: [...bidding.auction, { playerName: "Luc", call: "Coinche" }],
  };
  const event = { type: "coinche", team: NS, seat: 2 };
  assert.deepEqual(state.updateBidding("bidding", seats, coinched), [event]);
  assert.deepEqual(state.updateBidding("bidding", seats, coinched), []);
  assert.equal(latest("bidding", 2), "pleased");
  assert.equal(latest("bidding", 1), "annoyed");
  assert.ok(timers.size > 0);

  const boardWithCoinche = board({ coinched: true, declaringPlayerIndex: 1 });
  assert.deepEqual(state.updateBoard("bot", boardWithCoinche, { complete: false }), []);
  assert.equal(latest("bot", 2), "pleased");
});

test("board coinche transition is detected once when no auction update supplied it", () => {
  const { state } = harness();
  state.reset("table-one");
  state.updateBoard("private", board(), { complete: false });
  const coinched = board({ coinched: true, declaringPlayerIndex: 1 });
  assert.deepEqual(state.updateBoard("private", coinched, { complete: false }), [
    { type: "coinche", team: NS }
  ]);
  assert.deepEqual(state.updateBoard("private", coinched, { complete: false }), []);
});

test("game reset clears timers and prevents delayed writes", () => {
  const { state, timers, writes, fireTimers } = harness();
  state.reset("table-one");
  state.updateBoard("bot", board(), { complete: false });
  state.updateBoard("bot", board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Luc" }), { complete: false });
  assert.ok(timers.size > 0);
  const countBeforeReset = writes.length;
  state.reset("");
  assert.equal(timers.size, 0);
  fireTimers();
  assert.equal(writes.length, countBeforeReset);
});