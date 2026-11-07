const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const html = read("index.html");
const app = require("./app-source.cjs").appSource();
const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot-game"'));
const settingsStart = html.indexOf('data-view="settings"');
const settings = html.slice(settingsStart, html.indexOf("data-view=", settingsStart + 10));

test("home has four mode cards in a 2×2 grid, in order, and no sign-in panel", () => {
  const cards = [...home.matchAll(/<(?:a|button) class="mode-card[^"]*"[^>]*>[\s\S]*?<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
  assert.deepEqual(cards, ["Bring the crew", "Find a game", "Pass and play", "Learn the basics"]);
  for (const id of ["account-bar", "sign-in-panel", "sign-in-toggle"]) assert.ok(!home.includes(`id="${id}"`), id);
  assert.ok(home.includes('id="tutorial-banner"'));
  assert.match(read("styles.css"), /\.mode-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("the account bar and sign-in panel live in Settings, ids unchanged", () => {
  for (const id of ["account-bar", "sign-in-panel", "sign-in-toggle", "passkey-sign-in", "account-signed-in"]) {
    assert.ok(settings.includes(`id="${id}"`), id);
  }
});

test("Play now stays the only primary button of home, the goal line leads to Progress", () => {
  assert.equal((home.match(/class="button play-now"/g) ?? []).length, 1);
  assert.match(home, /<a class="goal-line" id="goal-line" href="\/stats" hidden>/);
  assert.ok(home.indexOf('id="play-now"') < home.indexOf('id="resume-card"'));
  assert.match(home, /<a class="resume-card" id="resume-card" href="\/play\/bot" hidden>/);
});

test("a solo match is remembered, resumed in a new tab, and forgotten when over", () => {
  assert.ok(html.indexOf('src="/home-status.js"') < html.indexOf('src="/app.js"'));
  assert.match(app, /readResume\(window\.localStorage\)/);
  assert.ok(app.includes("function rememberSoloMatch(snapshot)"));
  assert.ok(app.includes("if (!online) rememberSoloMatch(snapshot);"));
  assert.ok(app.includes('if (activeView === "home") loadResumeCard();'));
  assert.ok(app.includes("resume?.tableId === tableId"));
  assert.ok(app.includes("if (error.status) forgetResume(window.localStorage);"));
});

test("the new texts are translated", () => {
  for (const key of ["Resume your match", "{0} · your team {1}, theirs {2}"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
