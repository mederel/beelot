const test = require("node:test");
const assert = require("node:assert/strict");
const { mineNote, isMineListed } = require("../static/leaderboard-view.js");

test("a guest or a player with no rated match gets no note", () => {
  assert.equal(mineNote(null, 10), null);
});

test("a hidden player is told how to come back", () => {
  assert.match(mineNote({ hidden: true, rank: null, matches: 30, rating: 1600 }, 10).text, /hidden/);
});

test("a player with too few matches is told how many remain", () => {
  assert.deepEqual(mineNote({ hidden: false, rank: null, matches: 7, rating: 1520 }, 10).values, [3]);
  
});

test("a ranked player sees their rank and rating, even beyond the top fifty", () => {
  assert.deepEqual(mineNote({ hidden: false, rank: 83, matches: 40, rating: 1411 }, 10), { text: "Your rank: {0} ({1})", values: [83, 1411] });
});

test("the own row is marked only when it is in the list", () => {
  const rows = [{ rank: 1, rating: 1700 }, { rank: 2, rating: 1650 }];
  assert.equal(isMineListed(rows, { rank: 2, rating: 1650 }), true);
  assert.equal(isMineListed(rows, { rank: 83, rating: 1411 }), false);
  assert.equal(isMineListed(rows, null), false);
});
