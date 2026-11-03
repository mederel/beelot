const test = require("node:test");
const assert = require("node:assert/strict");
const { botEvents, expressionsFor, isThinking } = require("../static/bot-reactions.js");

const NS = "North–South";
const EW = "East–West";
const BOTS = new Set(["Camille", "Luc", "Manon", "Hugo"]);
const isBot = (name) => BOTS.has(name);

// Seats 0 and 2 are North–South, 1 and 3 East–West; seat 0 is a human unless told otherwise.
function board(overrides = {}) {
  return {
    seats: [
      { name: "Ana", team: NS },
      { name: "Camille", team: EW },
      { name: "Luc", team: NS },
      { name: "Manon", team: EW },
    ],
    hand: [],
    legalCards: [],
    completedTricks: 2,
    reviewingCompletedTrick: false,
    trickWinner: "",
    trickPoints: 0,
    coinched: false,
    declaringPlayerIndex: 0,
    declaringTeam: NS,
    dealerIndex: 3,
    roundResult: null,
    currentPlayer: "Ana",
    currentPlayerIndex: 0,
    activePlayerIndex: 1,
    ...overrides,
  };
}

const ALL_BOTS = [
  { name: "Hugo", team: NS },
  { name: "Camille", team: EW },
  { name: "Luc", team: NS },
  { name: "Manon", team: EW },
];

const MATCH = { complete: false, winner: null };

test("null previous gives no events", () => {
  assert.deepEqual(botEvents(null, board({ reviewingCompletedTrick: true, trickWinner: "Luc" }), MATCH), []);
});

test("identical boards give no events", () => {
  const reviewing = board({ reviewingCompletedTrick: true, trickWinner: "Luc", trickPoints: 25, coinched: true });
  assert.deepEqual(botEvents(reviewing, { ...reviewing }, MATCH), []);
  const result = board({ completedTricks: 8, roundResult: { contractMade: true, capotTeam: null } });
  assert.deepEqual(botEvents(result, { ...result }, { complete: true, winner: NS }), []);
});

test("a new reviewed trick gives one trick event with the winner's seat; big at 20 points, not at 19", () => {
  const before = board();
  assert.deepEqual(
    botEvents(before, board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Manon", trickPoints: 20 }), MATCH),
    [{ type: "trick", seat: 3, big: true }],
  );
  assert.deepEqual(
    botEvents(before, board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Manon", trickPoints: 19 }), MATCH),
    [{ type: "trick", seat: 3, big: false }],
  );
});

test("the next trick reviewed straight after another gives a new trick event", () => {
  const first = board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Manon", trickPoints: 4 });
  const second = board({ completedTricks: 4, reviewingCompletedTrick: true, trickWinner: "Luc", trickPoints: 30 });
  assert.deepEqual(botEvents(first, second, MATCH), [{ type: "trick", seat: 2, big: true }]);
});

test("a trick won by an unknown name gives no event", () => {
  assert.deepEqual(
    botEvents(board(), board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Nobody" }), MATCH),
    [],
  );
});

test("boards from a new round give no trick or coinche event", () => {
  const lastOfRound = board({ completedTricks: 8, roundResult: { contractMade: true, capotTeam: null } });
  const nextRound = board({ completedTricks: 0, dealerIndex: 0, coinched: true });
  assert.deepEqual(botEvents(lastOfRound, nextRound, MATCH), []);
  const midRound = board({ completedTricks: 5 });
  const reviewingNext = board({ completedTricks: 1, dealerIndex: 0, coinched: true, reviewingCompletedTrick: true, trickWinner: "Luc" });
  assert.deepEqual(botEvents(midRound, reviewingNext, MATCH), []);
});

test("round result gives contractMade/capot with the declaring team", () => {
  assert.deepEqual(
    botEvents(board({ completedTricks: 7 }), board({ completedTricks: 8, roundResult: { contractMade: true, capotTeam: null } }), MATCH),
    [{ type: "round", team: NS, contractMade: true, capot: false }],
  );
  assert.deepEqual(
    botEvents(
      board({ completedTricks: 7, declaringPlayerIndex: 1, declaringTeam: EW }),
      board({ completedTricks: 8, declaringPlayerIndex: 1, declaringTeam: EW, roundResult: { contractMade: false, capotTeam: NS } }),
      MATCH,
    ),
    [{ type: "round", team: EW, contractMade: false, capot: true }],
  );
});

test("the last trick and the round result on one board give both events, trick first", () => {
  const events = botEvents(
    board({ completedTricks: 7 }),
    board({ completedTricks: 8, reviewingCompletedTrick: true, trickWinner: "Luc", trickPoints: 22, roundResult: { contractMade: true, capotTeam: null } }),
    MATCH,
  );
  assert.deepEqual(events.map((e) => e.type), ["trick", "round"]);
});

test("a round result after missed boards of a new round still gives the round event", () => {
  const old = board({ completedTricks: 4 });
  const result = board({ completedTricks: 8, dealerIndex: 0, roundResult: { contractMade: true, capotTeam: null } });
  assert.deepEqual(botEvents(old, result, MATCH), [{ type: "round", team: NS, contractMade: true, capot: false }]);
});

test("match complete gives a match event with the winner team", () => {
  const events = botEvents(
    board({ completedTricks: 7 }),
    board({ completedTricks: 8, roundResult: { contractMade: false, capotTeam: null } }),
    { complete: true, winner: EW },
  );
  assert.deepEqual(events, [
    { type: "round", team: NS, contractMade: false, capot: false },
    { type: "match", team: EW },
  ]);
});

test("a pass-and-play viewer change gives no events", () => {
  const before = board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Luc" });
  const after = { ...before, hand: [{ rank: "A" }], legalCards: [{ rank: "A" }], currentPlayer: "Luc", currentPlayerIndex: 2 };
  assert.deepEqual(botEvents(before, after, MATCH), []);
});

test("a trick seen from another viewer gives the same absolute seat", () => {
  const before = board({ currentPlayerIndex: 2, currentPlayer: "Luc" });
  const after = board({ completedTricks: 3, reviewingCompletedTrick: true, trickWinner: "Manon", currentPlayerIndex: 0 });
  assert.deepEqual(botEvents(before, after, MATCH), [{ type: "trick", seat: 3, big: false }]);
  const fromSeat2 = expressionsFor(botEvents(before, after, MATCH), { ...after, currentPlayerIndex: 2 }, isBot);
  assert.deepEqual(expressionsFor(botEvents(before, after, MATCH), after, isBot), fromSeat2);
  assert.deepEqual(fromSeat2, { 1: "pleased", 3: "pleased" });
});

test("trick: winner pleased, partner pleased, opponents calm on a small trick", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "trick", seat: 3, big: false }], b, isBot), { 1: "pleased", 3: "pleased" });
});

test("trick: winner celebrating and opponents annoyed on a big trick", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "trick", seat: 3, big: true }], b, isBot), {
    0: "annoyed",
    1: "pleased",
    2: "annoyed",
    3: "celebrating",
  });
});

test("coinche: declaring team annoyed, the coincher pleased", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "coinche", team: EW, seat: 1 }], b, isBot), {
    0: "annoyed",
    1: "pleased",
    2: "annoyed",
  });
});

test("coinche without a known coincher: both defenders pleased", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "coinche", team: EW }], b, isBot), {
    0: "annoyed",
    1: "pleased",
    2: "annoyed",
    3: "pleased",
  });
});

test("round: made, declarers pleased and defenders annoyed", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "round", team: NS, contractMade: true, capot: false }], b, isBot), {
    0: "pleased",
    1: "annoyed",
    2: "pleased",
    3: "annoyed",
  });
});

test("round: failed, the reverse", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "round", team: NS, contractMade: false, capot: false }], b, isBot), {
    0: "annoyed",
    1: "pleased",
    2: "annoyed",
    3: "pleased",
  });
});

test("round: capot, the winners celebrating", () => {
  const b = board({ seats: ALL_BOTS });
  assert.deepEqual(expressionsFor([{ type: "round", team: NS, contractMade: true, capot: true }], b, isBot), {
    0: "celebrating",
    1: "annoyed",
    2: "celebrating",
    3: "annoyed",
  });
  assert.deepEqual(expressionsFor([{ type: "round", team: NS, contractMade: false, capot: true }], b, isBot), {
    0: "annoyed",
    1: "celebrating",
    2: "annoyed",
    3: "celebrating",
  });
});

test("match: winners celebrating, losers annoyed; a later event replaces an earlier one", () => {
  const b = board({ seats: ALL_BOTS });
  const events = [
    { type: "trick", seat: 0, big: true },
    { type: "round", team: NS, contractMade: false, capot: false },
    { type: "match", team: EW },
  ];
  assert.deepEqual(expressionsFor(events, b, isBot), { 0: "annoyed", 1: "celebrating", 2: "annoyed", 3: "celebrating" });
});

test("humans get no expression", () => {
  const b = board();
  const expressions = expressionsFor([{ type: "match", team: NS }], b, isBot);
  assert.deepEqual(expressions, { 1: "annoyed", 2: "celebrating", 3: "annoyed" });
  assert.equal(0 in expressions, false);
  assert.deepEqual(expressionsFor([{ type: "match", team: NS }], b, () => false), {});
});

test("no events give no expressions", () => {
  assert.deepEqual(expressionsFor([], board(), isBot), {});
});

test("isThinking only for the active seat, not during review or after the round result", () => {
  const b = board({ activePlayerIndex: 1 });
  assert.equal(isThinking(b, 1), true);
  assert.equal(isThinking(b, 2), false);
  assert.equal(isThinking(board({ activePlayerIndex: 1, reviewingCompletedTrick: true }), 1), false);
  assert.equal(isThinking(board({ activePlayerIndex: 1, roundResult: { contractMade: true } }), 1), false);
  assert.equal(isThinking(null, 1), false);
});
