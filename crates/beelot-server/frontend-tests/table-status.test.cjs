const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { tableStatus } = require("../static/table-status.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

const play = { phase: "play", myTurn: true, activeName: "Emile", passAndPlay: false };
const bidding = { phase: "bidding", myTurn: true, activeName: "Emile", passAndPlay: false };

test("it is the player's turn to play, or a bot is thinking", () => {
  assert.deepEqual(tableStatus(play), { text: "Your turn to play", args: [] });
  assert.deepEqual(tableStatus({ ...play, myTurn: false, activeName: "Luc" }), { text: "{0} is thinking…", args: ["Luc"] });
});

test("pass and play names the player instead of saying You", () => {
  assert.deepEqual(tableStatus({ ...play, passAndPlay: true }), { text: "{0}, your turn to play", args: ["Emile"] });
  assert.deepEqual(tableStatus({ ...bidding, passAndPlay: true }), { text: "{0}, your turn to bid", args: ["Emile"] });
});

test("bidding: my turn, a bot's turn, auction over", () => {
  assert.deepEqual(tableStatus(bidding), { text: "Your turn to bid", args: [] });
  assert.deepEqual(tableStatus({ ...bidding, myTurn: false, activeName: "Luc" }), { text: "{0} is thinking…", args: ["Luc"] });
  assert.deepEqual(tableStatus({ ...bidding, complete: true }), { text: "The auction is over", args: [] });
});

test("play: a collected trick, dealing and a finished round come before the turn", () => {
  assert.deepEqual(tableStatus({ ...play, reviewingTrick: true, trickWinner: "Luc" }), { text: "{0} takes the trick", args: ["Luc"] });
  assert.deepEqual(tableStatus({ ...play, dealing: true }), { text: "Dealing the remaining cards…", args: [] });
  assert.deepEqual(tableStatus({ ...play, roundOver: true, reviewingTrick: true, dealing: true }), { text: "Round over", args: [] });
});

const html = read("index.html");
const header = html.slice(html.indexOf('id="table-header"'), html.indexOf('data-view="home"'));

test("the header wraps the score bar and a bar with the menu and the status line", () => {
  assert.match(html, /<div class="table-header" id="table-header">/);
  assert.ok(header.indexOf('id="score-bar"') > 0 && header.indexOf('id="score-bar"') < header.indexOf('id="table-bar"'));
  assert.match(header, /<button[^>]*id="table-menu-toggle"[^>]*aria-controls="table-menu"[^>]*aria-expanded="false"/);
  assert.match(header, /id="table-status"[^>]*role="status"/);
});

test("the menu gathers Hint, Help and Leave, with Leave last and set apart", () => {
  const menu = header.slice(header.indexOf('id="table-menu"'));
  const order = ["id=\"table-hint-button\"", 'id="table-help-button"', 'class="table-menu-leave"'].map((needle) => menu.indexOf(needle));
  assert.ok(order.every((index) => index > 0), "all three entries exist");
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(menu, /<a class="table-menu-leave" data-confirm-leave="solo" href="\/play\/bot">Leave table<\/a>/);
});

test("the chips, footer links, hint buttons and bidding message are gone from the solo table", () => {
  for (const gone of ['id="declaring-team"', 'id="active-player"', 'class="game-footer"', 'id="hint-button"', 'id="bid-hint-button"', 'id="bidding-message"', 'class="game-hud"']) {
    assert.ok(!html.includes(gone), `${gone} removed`);
  }
});

test("the script loads before app.js and the texts are translated", () => {
  assert.ok(html.indexOf("/table-status.js") > 0 && html.indexOf("/table-status.js") < html.indexOf("/app.js"));
  const keys = ["Your turn to play", "Your turn to bid", "{0}, your turn to play", "{0}, your turn to bid", "{0} is thinking…",
    "{0} takes the trick", "Round over", "The auction is over", "Menu"];
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of keys) assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
  }
});

// Contrast of the bar's text on its background in every theme (US-087).
const css = `\n${read("styles.css")}`;
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start) + 2);
};
const declarations = (text) => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
const tokens = (theme) => {
  const root = declarations(rule(":root"));
  const override = css.match(new RegExp(`\\nbody\\[data-theme="${theme}"\\] \\{([^}]*)\\}`));
  return theme === "comic" || !override ? root : { ...root, ...declarations(override[1]) };
};
const full = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex);
const luminance = (color) => {
  const hex = full(color);
  const channel = (offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const ratio = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

test("the bar and its menu use ink on paper, readable in every theme", () => {
  for (const selector of [".table-bar", ".table-menu"]) {
    const text = rule(selector);
    assert.match(text, /background: var\(--card-paper\)/, `${selector} background`);
    assert.match(text, /color: var\(--card-ink\)/, `${selector} colour`);
  }
  for (const theme of ["comic", "classic-green", "midnight", "sunset"]) {
    const t = tokens(theme);
    assert.ok(ratio(t["--card-ink"], t["--card-paper"]) >= 4.5, `${theme}: ink on paper`);
  }
});
