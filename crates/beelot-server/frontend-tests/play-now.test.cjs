const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = read("app.js");

test("the home page has one Play now button in the hero, before the mode cards", () => {
  const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot"'));
  assert.equal(home.match(/id="play-now"/g).length, 1);
  assert.ok(home.indexOf('id="play-now"') < home.indexOf('class="mode-grid"'));
  assert.ok(home.indexOf('id="play-now"') > home.indexOf("<h1>"));
});

test("Play now starts a bot game with the defaults the setup form pre-selects", () => {
  const defaults = app.match(/const DEFAULT_BOT_GAME = (\{.*\});/)[1];
  assert.match(defaults, /difficulty: "RELAXED"/);
  assert.match(defaults, /variant: "CLASSIC"/);
  assert.match(defaults, /announcements: true/);
  assert.match(defaults, /allTrumps: true/);
  assert.match(defaults, /target: 1000/);
  for (const id of ["relaxed", "variant-classic", "announcements-on", "all-trumps-on", "target-1000"]) {
    assert.match(html, new RegExp(`checked id="${id}"`));
  }
});

test("Play now is translated into French and Dutch", () => {
  assert.match(read("i18n.js"), /"Play now": "Jouer maintenant"/);
  assert.match(read("i18n-nl.js"), /"Play now": "Nu spelen"/);
});
