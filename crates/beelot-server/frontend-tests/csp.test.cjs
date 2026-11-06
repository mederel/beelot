const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

// The Content-Security-Policy of the server allows no inline script or style (see app.rs).
test("the page has no inline script, style element or style attribute", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style\b/);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /\son[a-z]+="/);
});

test("scripts never write markup or a style attribute", () => {
  for (const file of fs.readdirSync(path.join(__dirname, "../static")).filter((name) => name.endsWith(".js"))) {
    const source = read(file);
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/, file);
    assert.doesNotMatch(source, /setAttribute\(\s*["']style["']/, file);
    assert.doesNotMatch(source, /\.cssText\b/, file);
  }
});

test("the theme swatches are classes", () => {
  const css = read("styles.css");
  for (const theme of ["comic", "classic-green", "midnight", "sunset"]) {
    assert.match(css, new RegExp(`\\.swatch-${theme} \\{ --swatch-a`));
    assert.match(read("index.html"), new RegExp(`theme-choice swatch-${theme}"`));
  }
});
