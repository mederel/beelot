const test = require("node:test");
const assert = require("node:assert/strict");
const { auctionView, playView, gameEvents } = require("../static/game-events.js");

const card = (rank, suit = "SPADES") => ({ rank, suit });
const seats = ["Ana", "Camille", "Luc", "Manon"].map((name) => ({ name }));
const board = (over = {}) => ({ seats, activePlayerIndex: 2, currentTrick: [card("K"), card("A")], completedTricks: 1, reviewingCompletedTrick: false, trickWinner: null, roundResult: null, ...over });

test("nothing is announced for the first rendering or a change of kind", () => {
  assert.deepEqual(gameEvents(null, playView(board())), []);
  assert.deepEqual(gameEvents(auctionView({ auction: [] }), playView(board())), []);
});

test("new calls are announced in speaking order", () => {
  const before = auctionView({ auction: [{ playerName: "Ana", call: "Pass" }] });
  const after = auctionView({ auction: [{ playerName: "Ana", call: "Pass" }, { playerName: "Camille", call: "80 Hearts" }, { playerName: "Luc", call: "Pass" }] });
  assert.deepEqual(gameEvents(before, after), [{ type: "call", player: "Camille", call: "80 Hearts" }, { type: "call", player: "Luc", call: "Pass" }]);
  assert.deepEqual(gameEvents(after, after), []);
  assert.deepEqual(gameEvents(after, auctionView({ auction: [] })), []);
});

test("the card play names who played each new card", () => {
  const before = playView(board());
  const after = playView(board({ activePlayerIndex: 3, currentTrick: [card("K"), card("A"), card("J")] }));
  assert.deepEqual(before.trick.map((entry) => entry.player), ["Ana", "Camille"]);
  assert.deepEqual(gameEvents(before, after), [{ type: "card", player: "Luc", card: card("J") }]);
});

test("a new trick announces its cards, a complete one its winner once", () => {
  const complete = playView(board({ activePlayerIndex: 0, currentTrick: [card("K"), card("A"), card("J"), card("7")], reviewingCompletedTrick: true, trickWinner: "Luc" }));
  const partial = playView(board({ activePlayerIndex: 3, currentTrick: [card("K"), card("A"), card("J")] }));
  assert.deepEqual(gameEvents(partial, complete).map((event) => event.type), ["card", "trick"]);
  assert.deepEqual(gameEvents(complete, complete), []);
  const nextTrick = playView(board({ completedTricks: 2, activePlayerIndex: 1, currentTrick: [card("9", "HEARTS")] }));
  assert.deepEqual(gameEvents(complete, nextTrick), [{ type: "card", player: "Ana", card: card("9", "HEARTS") }]);
});

test("the round and the match end are announced once", () => {
  const playing = playView(board());
  const over = playView(board({ roundResult: { contractMade: false } }), { complete: true, winner: "East–West" });
  assert.deepEqual(gameEvents(playing, over).filter((event) => event.type !== "card"), [{ type: "round", made: false }, { type: "match", winner: "East–West" }]);
  assert.deepEqual(gameEvents(over, over), []);
});
