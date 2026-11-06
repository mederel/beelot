const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = read("app.js");
const start = html.indexOf('<dialog class="setup-sheet"');
const sheet = html.slice(start, html.indexOf("</dialog>", start));
const names = (name) => [...sheet.matchAll(new RegExp(`name="${name}"[^>]*value="([^"]+)"`, "g"))].map((m) => m[1]);

test("the setup sheet is a labelled sheet with a grabber and a form", () => {
  assert.match(sheet, /^<dialog class="setup-sheet" data-sheet id="setup-sheet" aria-labelledby="setup-title">/);
  assert.match(sheet, /<div class="sheet-grabber" aria-hidden="true"><\/div>/);
  assert.match(sheet, /<form id="setup-form">/);
  assert.match(sheet, /<h2 id="setup-title">Set up your table<\/h2>/);
  assert.match(sheet, /<button class="sheet-close" id="setup-close" type="button" aria-label="Close">/);
});

test("it asks the mode, the variant, the bots and, under More rules, the target, announcements and tout-atout", () => {
  assert.deepEqual(names("setup-mode"), ["solo", "pass", "crew"]);
  assert.deepEqual(names("setup-variant"), ["CLASSIC", "CONTREE"]);
  assert.deepEqual(names("setup-difficulty"), ["RELAXED", "CHALLENGING"]);
  const rulesStart = sheet.indexOf('<details class="more-rules"');
  const rules = sheet.slice(rulesStart, sheet.indexOf('<p class="form-message"'));
  assert.match(rules, /<summary>More rules<\/summary>/);
  for (const [name, values] of [["setup-target", ["500", "1000", "1500", "2000"]], ["setup-announcements", ["on", "off"]], ["setup-all-trumps", ["on", "off"]]]) {
    assert.deepEqual([...rules.matchAll(new RegExp(`name="${name}"[^>]*value="([^"]+)"`, "g"))].map((m) => m[1]), values, name);
  }
  assert.doesNotMatch(sheet.replace(rules, ""), /name="setup-(target|announcements|all-trumps)"/);
});

test("it has the four seat names, the owner's name, a message and a submit button", () => {
  for (const seat of ["north", "east", "south", "west"]) assert.match(sheet, new RegExp(`id="setup-${seat}"[^>]*name="${seat}"`));
  assert.match(sheet, /id="setup-owner"[^>]*name="playerName"/);
  assert.match(sheet, /<p class="form-message" id="setup-message" role="alert"><\/p>/);
  assert.match(sheet, /<button class="button" id="setup-submit" type="submit">/);
  assert.doesNotMatch(sheet, /id="local-|setup-step|setup-next|setup-back/);
});

test("the old setup views and the create form are gone, and the private view links to the crew sheet", () => {
  assert.doesNotMatch(html, /data-view="bot"|data-view="local"|id="create-private-table-form"|id="bot-game-form"|id="pass-and-play-form"/);
  assert.match(html, /<a class="button" href="\/online\/private\/new">Create a private table<\/a>/);
  assert.match(html, /id="join-private-table-form"/);
});

test("setup-form.js loads before app.js and setup-steps.js is not loaded", () => {
  assert.ok(html.indexOf("/setup-form.js") > 0 && html.indexOf("/setup-form.js") < html.indexOf("/app.js"));
  assert.doesNotMatch(html, /setup-steps\.js/);
});

test("app.js opens the sheet from the route, as a route-less sheet, and builds the request from setup-form", () => {
  assert.match(app, /sheets\.openSheet\(setupDialog, \{\s+routed: false/);
  assert.match(app, /createRequest\(/);
  assert.match(app, /loadSetup\(/);
  assert.match(app, /saveSetup\(/);
  assert.doesNotMatch(app, /function savedBotGame|function showSetupStep|function showBotGameInForm|bot-game-form|pass-and-play-form/);
});

test("the wizard's files, selectors and helpers are gone", () => {
  assert.equal(fs.existsSync(path.join(__dirname, "../static/setup-steps.js")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "setup-steps.test.cjs")), false);
  const css = read("styles.css");
  for (const gone of ['data-view="bot"]', 'data-view="local"]', "setup-progress", "setup-actions", "local-seats", "difficulty-form", "difficulty-choice"]) {
    assert.ok(!css.includes(gone), `styles.css still has ${gone}`);
  }
  for (const gone of ["moveSetupStep", "SETUP_STEPS", "solo-all-trumps-settings", "local-all-trumps-settings"]) {
    assert.ok(!app.includes(gone) && !html.includes(gone), gone);
  }
});

test("the stylesheet styles the setup sheet: paper panel, seat names, message, 44px controls", () => {
  const css = read("styles.css");
  assert.match(css, /\.setup-sheet \{[^}]*max-height: calc\(100dvh/);
  assert.match(css, /\.setup-seats \{[^}]*display: grid/);
  assert.match(css, /\.setup-sheet \.form-message \{[^}]*color: #/);
  assert.match(css, /\.sheet-close \{[^}]*min-height: 44px/);
  assert.match(css, /\.more-rules summary \{[^}]*min-height: 44px/);
});
