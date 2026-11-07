const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { STATION_LEVELS, boxesIntersect, chooseStationLevel } = require("../static/table-fit.js");

const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");

test("boxes that only touch do not intersect, overlapping ones do", () => {
  assert.equal(boxesIntersect(box(0, 0, 10, 10), box(10, 0, 20, 10)), false);
  assert.equal(boxesIntersect(box(0, 0, 10, 10), box(9, 9, 20, 20)), true);
  assert.equal(boxesIntersect(box(0, 0, 10, 10), box(2, 2, 4, 4)), true);
});

test("stations shrink in steps until none touches a trick card, and stop at the smallest level", () => {
  const card = box(100, 100, 170, 200);
  const at = (overlapUntil) => (level) => ({
    stations: [STATION_LEVELS.indexOf(level) < overlapUntil ? box(150, 150, 300, 220) : box(300, 300, 400, 340)],
    cards: [card]
  });
  assert.equal(chooseStationLevel(at(0)), "");
  assert.equal(chooseStationLevel(at(1)), "stations-compact");
  assert.equal(chooseStationLevel(at(3)), "stations-low");
  assert.equal(chooseStationLevel(at(9)), "stations-low");
});

test("the levels, the layout script and the long-name rules are wired", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('src="/table-fit.js"') < html.indexOf('src="/app-layout.js"'));
  assert.ok(html.indexOf('src="/app-layout.js"') < html.indexOf('src="/app.js"'));
  const layout = read("app-layout.js");
  assert.ok(layout.includes("chooseStationLevel("));
  assert.ok(layout.includes('".trick-slot .playing-card"'));
  assert.ok(layout.includes('addEventListener("resize"'));
  const css = read("styles.css");
  assert.match(css, /\.player-station \.player-details strong, \.player-station \.seat-meta \{[^}]*text-overflow: ellipsis/);
  for (const level of STATION_LEVELS.filter(Boolean)) assert.ok(css.includes(`.${level} .player-station`), level);
  assert.match(css, /\.trick-points \{ left: auto; margin-right: \.35rem; right: 100%/);
});
