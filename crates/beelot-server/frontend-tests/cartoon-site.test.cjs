const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A leading newline lets every rule, the first included, be found by "\nselector {".
const css = `\n${fs.readFileSync(path.join(__dirname, "../static/styles.css"), "utf8")}`;

// The declarations of the first rule whose selector is exactly `selector`.
function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("\n}", start) + 2);
}

// The one-line theme override `body[data-theme="…"] { … }`.
function themeRule(theme) {
  const match = css.match(new RegExp(`\\nbody\\[data-theme="${theme}"\\] \\{([^}]*)\\}`));
  return match ? match[1] : "";
}

function declarations(text) {
  const map = {};
  for (const [, name, value] of text.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[name] = value.trim();
  return map;
}

// The tokens of a theme: `:root` first, then the theme's own overrides.
function tokens(theme) {
  const root = declarations(rule(":root"));
  return theme === "comic" ? root : { ...root, ...declarations(themeRule(theme)) };
}

// `#rgb` is written out as `#rrggbb`.
function full(hex) {
  return hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
}

function luminance(color) {
  const hex = full(color);
  const channel = (offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test("the page is the table's felt", () => {
  const body = rule("body");
  assert.ok(body.includes("var(--felt)"), "the body background uses --felt");
  assert.ok(body.includes("var(--felt-dot)"), "the body background uses --felt-dot");
  for (const old of ["#171333", "#22204e", "#11152f"]) assert.ok(!body.includes(old), `the old sky colour ${old} is gone`);
  assert.ok(!css.includes("rgba(255,255,255,.055) 1.2px"), "the white-dot overlay is gone");
});

test("the cartoon tokens exist", () => {
  const root = declarations(rule(":root"));
  assert.equal(root["--tilt"], "1.2deg");
  assert.equal(root["--radius-panel"], "12px");
});

test("text pairs keep their contrast in every theme", () => {
  for (const theme of ["comic", "classic-green", "midnight", "sunset"]) {
    const t = tokens(theme);
    const pairs = [
      ["--card-ink", "--card-paper"], ["--card-ink", "--gold"], ["--card-ink", "--pink"],
      ["--card-ink", "--aqua"], ["--card-ink", "--violet"], ["--card-red", "--card-paper"],
      ["--card-paper", "--seat-bg"],
    ];
    for (const [text, background] of pairs) {
      assert.ok(t[text] && t[background], `${theme}: ${text} and ${background} are defined`);
      assert.ok(ratio(t[text], t[background]) >= 4.5,
        `${theme}: ${text} on ${background} is ${ratio(t[text], t[background]).toFixed(2)}:1, below 4.5:1`);
    }
    // White text on the felt is outlined in ink: the outline carries the contrast.
    assert.ok(ratio("#ffffff", t["--card-ink"]) >= 4.5, `${theme}: white on the ink outline`);
  }
});
