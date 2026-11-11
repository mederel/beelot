const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../static/styles.css"), "utf8");

test("on phones a bid tag is a small label that wraps, so it cannot cover the played card", () => {
  const marker = css.indexOf("a bid tag keeps its readable size but wraps");
  assert.ok(marker >= 0, "the fix is in the stylesheet");
  const phone = css.lastIndexOf("@media (max-width: 760px)", marker);
  assert.ok(phone >= 0, "the fix sits in the phone media block");
  const next = css.indexOf("\n@media", marker);
  const block = css.slice(phone, next === -1 ? undefined : next);
  const rule = block.match(/\n\s*\.player-call \{([^}]*)\}/);
  assert.ok(rule, "the phone block sets the bid tag");
  const declarations = rule[1];
  assert.match(declarations, /white-space: normal/);
  const maxWidth = Number(declarations.match(/max-width: (\d+)px/)[1]);
  assert.ok(maxWidth <= 96, `max-width ${maxWidth}px`);
  const fontSize = Number(declarations.match(/font-size: \.(\d+)rem/)[1]);
  assert.ok(fontSize >= 60 && fontSize <= 70, `font-size .${fontSize}rem`);
});
