import { test } from "vitest";
import assert from "node:assert/strict";
import { callKind, callKey, contractAfterCall, contractFromAuction, contractFromBoard } from "$lib/models/contract-badge";

// The calls as the server codes them (`callCode`).
const pass = { code: "call-pass", params: {} };
const coinche = { code: "call-coinche", params: {} };
const bid = (value, trump) => ({ code: "call-bid", params: { value: String(value), trump } });
const trump = (name) => ({ code: "call-trump", params: { trump: name } });

const AUCTION = [
  { playerName: "You", callCode: bid(90, "HEARTS") },
  { playerName: "Camille", callCode: pass },
  { playerName: "Luc", callCode: bid(110, "HEARTS") },
  { playerName: "Manon", callCode: pass }
];

test("a call is a pass, a coinche, a bid or a chosen trump", () => {
  assert.deepEqual([pass, coinche, bid(90, "HEARTS"), trump("SPADES"), null, undefined].map(callKind), ["pass", "coinche", "bid", "trump", null, null]);
  assert.notEqual(callKey(bid(90, "HEARTS")), callKey(bid(100, "HEARTS")));
  assert.notEqual(callKey(bid(90, "HEARTS")), callKey(bid(90, "CLUBS")));
  assert.equal(callKey(bid(90, "HEARTS")), callKey(bid(90, "HEARTS")));
  assert.equal(callKey(null), "");
});

test("a first bid makes the contract", () => {
  assert.deepEqual(contractAfterCall(null, "You", bid(90, "HEARTS")), {
    player: "You",
    value: 90,
    suit: "HEARTS",
    coinched: false
  });
});

test("a raise by another player moves the holder", () => {
  const c = contractAfterCall(null, "You", bid(90, "HEARTS"));
  const raised = contractAfterCall(c, "Luc", bid(110, "HEARTS"));
  assert.equal(raised.player, "Luc");
  assert.equal(raised.value, 110);
});

test("passes keep the contract and a first pass gives none", () => {
  const c = contractAfterCall(null, "You", bid(90, "HEARTS"));
  assert.equal(contractAfterCall(c, "Camille", pass), c);
  assert.equal(contractAfterCall(null, "Camille", pass), null);
  assert.equal(contractAfterCall(c, "Camille", null), c);
});

test("coinche marks the contract and keeps its holder", () => {
  const c = contractAfterCall(null, "You", bid(90, "HEARTS"));
  assert.deepEqual(contractAfterCall(c, "Camille", coinche), { ...c, coinched: true });
  assert.equal(contractAfterCall(null, "Camille", coinche), null);
});

test("a chosen trump has no value", () => {
  assert.deepEqual(contractAfterCall(null, "Ana", trump("SPADES")), {
    player: "Ana",
    value: null,
    suit: "SPADES",
    coinched: false
  });
});

test("tout atout and sans atout bids keep their name", () => {
  const all = contractAfterCall(null, "Ana", bid(100, "ALL_TRUMPS"));
  assert.equal(all.value, 100);
  assert.equal(all.suit, "ALL_TRUMPS");
  const none = contractAfterCall(null, "Ana", bid(80, "NO_TRUMPS"));
  assert.equal(none.value, 80);
  assert.equal(none.suit, "NO_TRUMPS");
});

test("an auction folds to its last bid", () => {
  assert.deepEqual(contractFromAuction(AUCTION), { player: "Luc", value: 110, suit: "HEARTS", coinched: false });
  assert.equal(contractFromAuction(AUCTION.slice(0, 2)).player, "You");
  assert.equal(contractFromAuction([]), null);
});

test("a board gives its contract", () => {
  const board = {
    variant: "CONTREE",
    seats: [{ name: "Ana" }, { name: "Camille" }, { name: "Luc" }, { name: "Manon" }],
    declaringPlayerIndex: 2,
    contractValue: 100,
    trump: "Spades",
    coinched: true
  };
  assert.deepEqual(contractFromBoard(board), { player: "Luc", value: 100, suit: "Spades", coinched: true });
  assert.equal(contractFromBoard({ ...board, variant: "CLASSIC" }).value, null);
  const { declaringPlayerIndex, ...without } = board;
  assert.equal(contractFromBoard(without), null);
});
