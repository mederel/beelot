const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = require("./app-source.cjs").appSource();

test("the home page has one Play now button in the hero, before the mode cards", () => {
  const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot-game"'));
  assert.equal(home.match(/id="play-now"/g).length, 1);
  assert.ok(home.indexOf('id="play-now"') < home.indexOf('class="mode-grid"'));
  assert.ok(home.indexOf('id="play-now"') > home.indexOf("<h1>"));
});

test("the setup sheet pre-selects the defaults", () => {
  const { DEFAULT_SETUP } = require("../static/setup-form.js");
  assert.deepEqual(DEFAULT_SETUP, { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 });
  for (const [name, value] of [["setup-variant", "CLASSIC"], ["setup-difficulty", "RELAXED"], ["setup-announcements", "on"], ["setup-all-trumps", "on"], ["setup-target", "1000"], ["setup-mode", "solo"]]) {
    assert.match(html, new RegExp(`<input checked name="${name}" type="radio" value="${value}">`), name);
  }
});

test("Play now opens the setup sheet with the last choices instead of starting a game (US-154)", () => {
  assert.ok(!html.includes('id="quick-game"'));
  assert.ok(!html.includes("customise-line"), "the Customise link is redundant now");
  assert.match(app, /document\.querySelector\("#play-now"\)\.addEventListener\("click", \(\) => navigate\("\/play\/bot"\)\)/);
  assert.ok(!/startGame\(createRequest\("solo", loadSetup/.test(app), "Play now no longer starts a game by itself");
});

test("the setup sheet's choices are remembered per mode and shown again when it opens", () => {
  assert.match(app, /saveSetup\(window\.localStorage, mode, /);
  assert.match(app, /fillSetup\(loadSetup\(window\.localStorage, mode\)\)/);
});

test("Play now is translated into French and Dutch", () => {
  assert.match(read("i18n.js"), /"Play now": "Jouer maintenant"/);
  assert.match(read("i18n-nl.js"), /"Play now": "Nu spelen"/);
  assert.match(read("i18n.js"), /"Customise": "Personnaliser"/);
  assert.match(read("i18n-nl.js"), /"Customise": "Aanpassen"/);
});
