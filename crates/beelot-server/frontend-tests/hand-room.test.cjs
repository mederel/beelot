const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handLayout } = require("../static/card-physics.js");

test("a hand of up to five cards is one row, more cards make two balanced rows", () => {
  assert.deepEqual(handLayout(0), { cols: 1, rows: 1 });
  assert.deepEqual(handLayout(1), { cols: 1, rows: 1 });
  assert.deepEqual(handLayout(3), { cols: 3, rows: 1 });
  assert.deepEqual(handLayout(4), { cols: 4, rows: 1 });
  assert.deepEqual(handLayout(5), { cols: 5, rows: 1 });
  assert.deepEqual(handLayout(6), { cols: 3, rows: 2 });
  assert.deepEqual(handLayout(7), { cols: 4, rows: 2 });
  assert.deepEqual(handLayout(8), { cols: 4, rows: 2 });
});

const css = fs.readFileSync(path.join(__dirname, "../static/styles.css"), "utf8");
const px = (text, name) => Number(text.match(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1]);

// The body of the first `@media (query) { … }` block, with its nested braces.
function media(query) {
  const start = css.indexOf(`@media ${query} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

test("portrait phones get a two-row grid hand with targets of at least 44px", () => {
  const block = media("(max-width: 600px) and (orientation: portrait)");
  assert.ok(block, "the portrait block exists");
  const hand = block.slice(block.indexOf(".table-hand {"), block.indexOf("}", block.indexOf(".table-hand {")));
  assert.match(hand, /display: grid/);
  assert.match(hand, /repeat\(var\(--hand-cols, 4\), var\(--cw\)\)/);
  assert.ok(px(hand, "--cw") >= 44, "card width");
  assert.ok(px(hand, "grid-auto-rows") >= 44, "visible height of a first-row card");
  assert.match(block, /\.table-hand \.playing-card \{[^}]*rotate: 0deg/);
  assert.match(block, /\.table-hand\[data-rows="2"\]/);
});

test("landscape phones open the fan so a slice is at least 44px", () => {
  const block = media("(max-width: 760px) and (orientation: landscape)");
  assert.ok(block, "the landscape block exists");
  const overlap = Number(block.match(/\.table-hand \.playing-card \+ \.playing-card \{ margin-left: calc\(var\(--cw\) \* -(\d*\.?\d+)\)/)?.[1]);
  assert.ok(overlap >= 0, "overlap rule");
  assert.ok(50 * (1 - overlap) >= 44, "a 50px card shows at least 44px");
});
