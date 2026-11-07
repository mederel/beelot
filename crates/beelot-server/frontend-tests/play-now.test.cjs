const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = read("app.js");

test("the home page has one Play now button in the hero, before the mode cards", () => {
  const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot-game"'));
  assert.equal(home.match(/id="play-now"/g).length, 1);
  assert.ok(home.indexOf('id="play-now"') < home.indexOf('class="mode-grid"'));
  assert.ok(home.indexOf('id="play-now"') > home.indexOf("<h1>"));
});

test("Play now starts a solo game, and the setup sheet pre-selects the same defaults", () => {
  const { DEFAULT_SETUP } = require("../static/setup-form.js");
  assert.deepEqual(DEFAULT_SETUP, { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 });
  for (const [name, value] of [["setup-variant", "CLASSIC"], ["setup-difficulty", "RELAXED"], ["setup-announcements", "on"], ["setup-all-trumps", "on"], ["setup-target", "1000"], ["setup-mode", "solo"]]) {
    assert.match(html, new RegExp(`<input checked name="${name}" type="radio" value="${value}">`), name);
  }
});

test("Play now starts a game, Customise opens the setup form", () => {
  assert.ok(!html.includes('id="quick-game"'));
  assert.match(html, /<a class="text-link" href="\/play\/bot">Customise<\/a>/);
  assert.match(app, /\["#play-now"\]/);
});

test("the setup sheet's choices are remembered per mode, and Play now uses the solo ones", () => {
  assert.match(app, /saveSetup\(window\.localStorage, mode, /);
  assert.match(app, /fillSetup\(loadSetup\(window\.localStorage, mode\)\)/);
  assert.match(app, /startGame\(createRequest\("solo", loadSetup\(window\.localStorage, "solo"\)\)\)/);
});

test("Play now is translated into French and Dutch", () => {
  assert.match(read("i18n.js"), /"Play now": "Jouer maintenant"/);
  assert.match(read("i18n-nl.js"), /"Play now": "Nu spelen"/);
  assert.match(read("i18n.js"), /"Customise": "Personnaliser"/);
  assert.match(read("i18n-nl.js"), /"Customise": "Aanpassen"/);
});
