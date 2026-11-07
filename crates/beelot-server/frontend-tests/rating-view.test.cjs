const test = require("node:test");
const assert = require("node:assert/strict");
const { ratingRows, sparklinePoints } = require("../static/rating-view.js");

test("a rating with a wide deviation is provisional", () => {
  const rows = ratingRows([
    { variant: "CLASSIC", rating: 1530, deviation: 180, matches: 2, history: [] },
    { variant: "CONTREE", rating: 1610, deviation: 70, matches: 40 }
  ]);
  assert.deepEqual(rows.map((row) => row.provisional), [true, false]);
  assert.deepEqual(rows[1].history, []);
  assert.deepEqual(ratingRows(undefined), []);
});

test("the sparkline runs left to right with higher ratings higher up", () => {
  const points = sparklinePoints([{ rating: 1500 }, { rating: 1520 }, { rating: 1480 }], 100, 30)
    .split(" ")
    .map((pair) => pair.split(",").map(Number));
  assert.equal(points[0][0], 0);
  assert.equal(points[2][0], 100);
  assert.ok(points[1][1] < points[0][1] && points[0][1] < points[2][1]);
});

test("one point is drawn in the middle and no point is nothing", () => {
  assert.equal(sparklinePoints([{ rating: 1500 }], 100, 30), "50.0,15.0");
  assert.equal(sparklinePoints([], 100, 30), "");
});
