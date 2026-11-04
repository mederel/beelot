const test = require("node:test");
const assert = require("node:assert/strict");
const { matchEndModel } = require("../static/match-end.js");

const NS = "North–South";
const EW = "East–West";

const zero = { tierce: 0, cinquante: 0, cent: 0, carre: 0 };
const match = (overrides = {}) => ({
  complete: true,
  winner: EW,
  northSouth: 760,
  eastWest: 1040,
  recap: {
    rounds: 7,
    biggestRound: { round: 4, team: EW, points: 182 },
    announcements: { northSouth: { ...zero, tierce: 1, carre: 1 }, eastWest: { ...zero } },
  },
  ...overrides,
});
const seats = [
  { name: "You", team: NS },
  { name: "Camille", team: EW },
  { name: "Luc", team: NS },
  { name: "Manon", team: EW },
];

test("the podium puts the winner first with its names and score", () => {
  const model = matchEndModel({ match: match(), seats, myTeam: 0 });
  assert.equal(model.winner, EW);
  assert.deepEqual(model.podium, [
    { place: 1, team: EW, names: ["Camille", "Manon"], score: 1040 },
    { place: 2, team: NS, names: ["You", "Luc"], score: 760 },
  ]);
});

test("the podium follows a North–South win", () => {
  const model = matchEndModel({
    match: match({ winner: NS, northSouth: 1010, eastWest: 640 }),
    seats,
    myTeam: 0,
  });
  assert.deepEqual(model.podium, [
    { place: 1, team: NS, names: ["You", "Luc"], score: 1010 },
    { place: 2, team: EW, names: ["Camille", "Manon"], score: 640 },
  ]);
});

test("iWon is true only for a viewer on the winning team", () => {
  assert.equal(matchEndModel({ match: match(), seats, myTeam: 1 }).iWon, true);
  assert.equal(matchEndModel({ match: match(), seats, myTeam: 0 }).iWon, false);
  assert.equal(matchEndModel({ match: match(), seats, myTeam: null }).iWon, false);
});

test("the announcements list only what scored, in kind order", () => {
  const { recap } = matchEndModel({ match: match(), seats, myTeam: 0 });
  assert.equal(recap.rounds, 7);
  assert.deepEqual(recap.announcements, [
    { team: NS, items: [{ kind: "tierce", count: 1 }, { kind: "carre", count: 1 }] },
    { team: EW, items: [] },
  ]);
});

test("the biggest round is passed through, and may be missing", () => {
  assert.deepEqual(matchEndModel({ match: match(), seats, myTeam: 0 }).recap.biggestRound, {
    round: 4,
    team: EW,
    points: 182,
  });
  const none = match();
  none.recap.biggestRound = null;
  assert.equal(matchEndModel({ match: none, seats, myTeam: 0 }).recap.biggestRound, null);
});

test("there is no model without a finished match with a winner and a recap", () => {
  assert.equal(matchEndModel({ match: null, seats, myTeam: 0 }), null);
  assert.equal(matchEndModel({ match: undefined, seats, myTeam: 0 }), null);
  assert.equal(matchEndModel({ match: match({ complete: false }), seats, myTeam: 0 }), null);
  assert.equal(matchEndModel({ match: match({ winner: null }), seats, myTeam: 0 }), null);
  assert.equal(matchEndModel({ match: match({ recap: undefined }), seats, myTeam: 0 }), null);
});
