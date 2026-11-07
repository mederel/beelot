const test = require("node:test");
const assert = require("node:assert/strict");
const { costlyAtStep, costlySummary } = require("../static/review-analysis.js");

const analysis = { complete: true, costly: [{ trick: 2, position: 1, pointsLost: 14 }, { trick: 5, position: 0, pointsLost: 20 }] };

test("a step shows the costly cards of its own trick, and the deal none", () => {
  assert.equal(costlyAtStep(analysis, 0).length, 0);
  assert.equal(costlyAtStep(analysis, 3)[0].pointsLost, 14);
  assert.equal(costlyAtStep(analysis, 4).length, 0);
  assert.deepEqual(costlyAtStep(null, 3), []);
  assert.deepEqual(costlyAtStep(undefined, 3), []);
});

test("the summary says the cards are analysed, then how many cost points", () => {
  assert.match(costlySummary(undefined).text, /Analysing/);
  assert.equal(costlySummary(null), null);
  assert.deepEqual(costlySummary(analysis).values, [2]);
  assert.match(costlySummary({ complete: true, costly: [] }).text, /well played/);
});

test("a partial analysis says so", () => {
  assert.match(costlySummary({ complete: false, costly: [] }).text, /part analysed/);
  assert.match(costlySummary({ complete: false, costly: analysis.costly }).text, /partial/);
});
