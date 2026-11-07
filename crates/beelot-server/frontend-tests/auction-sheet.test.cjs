const test = require("node:test");
const assert = require("node:assert/strict");
const { auctionSheet, BID_VALUES, SUITS } = require("../static/auction-sheet.js");

const contree = (extra) => ({
  variant: "CONTREE", round: 1, activePlayer: "You", playerTurn: true, complete: false, coincheAllowed: false,
  highestBid: 110, highestBidSuit: "HEARTS", highestBidder: "Luc", upturnedCard: null,
  auction: [{ playerName: "You", call: "90 Hearts" }, { playerName: "Camille", call: "Pass" }, { playerName: "Luc", call: "110 Hearts" }],
  ...extra
});
const classic = (extra) => ({
  variant: "CLASSIC", round: 1, activePlayer: "You", playerTurn: true, complete: false, coincheAllowed: false,
  highestBid: 0, highestBidSuit: "", highestBidder: "", upturnedCard: { rank: "K", suit: "HEARTS", symbol: "♥" }, auction: [],
  ...extra
});

test("Contrée is the bid mode, Classic round 1 takes, round 2 chooses a suit", () => {
  assert.deepEqual([auctionSheet(contree(), {}).mode, auctionSheet(contree(), {}).title], ["bid", "Your call"]);
  const take = auctionSheet(classic(), {});
  assert.deepEqual([take.mode, take.title, take.titleSuit], ["take", "Take {0}?", "HEARTS"]);
  assert.deepEqual(take.take, { suit: "HEARTS", disabled: false });
  const suit = auctionSheet(classic({ round: 2 }), {});
  assert.deepEqual([suit.mode, suit.title, suit.take], ["suit", "Choose a trump suit", null]);
});

test("the history is the auction as it stands", () => {
  const bidding = contree();
  assert.deepEqual(auctionSheet(bidding, {}).history, bidding.auction);
  assert.deepEqual(auctionSheet(classic(), {}).history, []);
});

test("values at or below the standing bid are disabled with a reason", () => {
  const { values } = auctionSheet(contree(), {});
  assert.deepEqual(values.map((v) => v.value), BID_VALUES);
  assert.deepEqual(values.filter((v) => v.disabled).map((v) => v.value), [80, 90, 100, 110]);
  assert.equal(values[3].reason, "Bid more than {0}");
  assert.equal(values[3].reasonValue, 110);
  assert.equal(values[4].reason, null);
});

test("at 160 nothing can be bid and the reason says so", () => {
  const sheet = auctionSheet(contree({ highestBid: 160 }), {});
  assert.ok(sheet.values.every((v) => v.disabled));
  assert.equal(sheet.bid.disabled, true);
  assert.equal(sheet.bid.reason, "No higher bid is possible: pass or coinche");
});

test("the bid is the lowest legal value, with the first legal suit unless the player chose one", () => {
  assert.deepEqual(auctionSheet(contree(), {}).bid, { value: 120, suit: "CLUBS", disabled: false, reason: null });
  assert.equal(auctionSheet(contree(), { suit: "SPADES" }).bid.suit, "SPADES");
  assert.equal(auctionSheet(contree(), { suit: "ALL_TRUMPS" }).bid.suit, "CLUBS");
  assert.equal(auctionSheet(contree(), { suit: "ALL_TRUMPS", allTrumps: true }).bid.suit, "ALL_TRUMPS");
});

test("no-trumps and all-trumps are offered only in Contrée on a table that plays them", () => {
  assert.deepEqual(auctionSheet(contree(), {}).suits.map((s) => s.suit), SUITS);
  assert.deepEqual(auctionSheet(contree(), { allTrumps: true }).suits.map((s) => s.suit), [...SUITS, "NO_TRUMPS", "ALL_TRUMPS"]);
  assert.deepEqual(auctionSheet(classic({ round: 2 }), { allTrumps: true }).suits.map((s) => s.suit), SUITS);
});

test("the upturned suit cannot be chosen in round 2", () => {
  const { suits } = auctionSheet(classic({ round: 2 }), {});
  const hearts = suits.find((s) => s.suit === "HEARTS");
  assert.deepEqual([hearts.disabled, hearts.reason], [true, "That suit was passed on the first round"]);
  assert.ok(suits.filter((s) => s.suit !== "HEARTS").every((s) => !s.disabled && s.reason === null));
});

test("outside the player's turn everything is disabled and waits for the active player", () => {
  const sheet = auctionSheet(contree({ playerTurn: false, activePlayer: "Luc", coincheAllowed: true }), { allTrumps: true });
  assert.equal(sheet.enabled, false);
  assert.deepEqual([sheet.pass.disabled, sheet.pass.reason, sheet.pass.reasonValue], [true, "Waiting for {0}…", "Luc"]);
  assert.ok(sheet.values.every((v) => v.disabled && v.reason === null));
  assert.ok(sheet.suits.every((s) => s.disabled));
  assert.deepEqual([sheet.coinche.shown, sheet.coinche.disabled], [true, true]);
  assert.equal(sheet.bid.disabled, true);
  assert.equal(sheet.bid.reason, "Waiting for {0}…");
  const take = auctionSheet(classic({ playerTurn: false, activePlayer: "Camille" }), {});
  assert.deepEqual(take.take, { suit: "HEARTS", disabled: true });
});

test("a finished auction is disabled too", () => {
  assert.equal(auctionSheet(contree({ complete: true }), {}).enabled, false);
});

test("coinche is shown only when allowed", () => {
  assert.equal(auctionSheet(contree(), {}).coinche.shown, false);
  assert.deepEqual(auctionSheet(contree({ coincheAllowed: true }), {}).coinche, { shown: true, disabled: false });
});

test("the snapshot is not changed", () => {
  const bidding = contree();
  const copy = JSON.parse(JSON.stringify(bidding));
  auctionSheet(bidding, { allTrumps: true, suit: "SPADES" });
  assert.deepEqual(bidding, copy);
});
