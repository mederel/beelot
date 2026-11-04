const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = `\n${fs.readFileSync(path.join(__dirname, "../static/styles.css"), "utf8")}`;

// The body of the first rule whose selector is exactly `selector`.
function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
}

// The last rule for `selector` (a later override wins).
function lastRule(selector) {
  const start = css.lastIndexOf(`\n${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
}

// Every offset of a text-shadow value that is not the outline's own, as [x, y] pairs in px.
const offsets = (shadow) => [...shadow.matchAll(/(-?\d+)px (-?\d+)px 0/g)].map(([, x, y]) => [Number(x), Number(y)]);

test("headings leave room between their lines", () => {
  assert.ok(Number(rule("h1").match(/line-height:\s*([\d.]+)/)?.[1]) >= 1);
});

test("only the home hero has a drop shadow beyond the outline; other headings are outline only", () => {
  const h1 = lastRule("h1").match(/text-shadow:\s*([^;]+);/)?.[1] ?? "";
  assert.equal(h1.trim(), "var(--text-outline)");
  const hero = lastRule(".home-view h1").match(/text-shadow:\s*([^;]+);/)?.[1] ?? "";
  assert.match(hero, /3px 3px 0/);
});

test("the thin outline has no drop shadow", () => {
  const token = css.match(/--text-outline-thin:\s*([^;]+);/)?.[1];
  assert.ok(token, "the token exists");
  for (const [x, y] of offsets(token)) assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1, `offset ${x},${y}`);
});

test("eyebrows, subtitles, the step line and legends use the thin outline", () => {
  for (const selector of [".eyebrow", ".difficulty-summary", ".bidding-variant", ".setup-progress", ".difficulty-form legend"]) {
    const block = css.slice(css.lastIndexOf("/* Clean headings on the felt (US-111)"));
    assert.ok(block.includes(selector), `${selector} is in the override block`);
  }
  const block = css.slice(css.lastIndexOf("/* Clean headings on the felt (US-111)"));
  assert.match(block, /text-shadow: var\(--text-outline-thin\)/);
});
