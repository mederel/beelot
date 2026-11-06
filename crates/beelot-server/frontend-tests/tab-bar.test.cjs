const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { tabs } = require("../static/router.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const nav = html.slice(html.indexOf('<nav class="tab-bar"'), html.indexOf("</nav>", html.indexOf('<nav class="tab-bar"')));

test("the page has a labelled main nav with the four tabs, in the order of the tab list", () => {
  assert.match(nav, /^<nav class="tab-bar" id="tab-bar" aria-label="Main">/);
  const links = [...nav.matchAll(/<a class="tab" data-tab="([^"]+)" href="([^"]+)"><span class="tab-glyph" aria-hidden="true">([^<]+)<\/span><span class="tab-label">([^<]+)<\/span><\/a>/g)]
    .map((m) => ({ id: m[1], href: m[2], glyph: m[3], label: m[4] }));
  assert.deepEqual(links, tabs.map(({ id, href, glyph, label }) => ({ id, href, glyph, label })));
});

test("the bar comes after the views, inside the shell", () => {
  assert.ok(html.indexOf('<nav class="tab-bar"') > html.indexOf('data-view="settings"'));
  assert.ok(html.indexOf('<nav class="tab-bar"') < html.indexOf("</main>"));
});

test("the old Settings link is gone from the page and the script", () => {
  assert.doesNotMatch(html, /settings-link/);
  const app = read("app.js");
  assert.doesNotMatch(app, /settings-link|settingsLink/);
});

test("renderView shows or hides the bar from the route's tab", () => {
  const app = read("app.js");
  assert.match(app, /tabBarState\(routeFor\(window\.location\.pathname\)\.tab\)/);
  assert.match(app, /#tab-bar/);
});

test("the labels are translated into French and Dutch", () => {
  const texts = {
    "i18n.js": { Play: "Jouer", Crew: "Équipe", Progress: "Progrès", Me: "Moi", Main: "Principale" },
    "i18n-nl.js": { Play: "Spelen", Crew: "Team", Progress: "Voortgang", Me: "Ik", Main: "Hoofdmenu" }
  };
  for (const [file, entries] of Object.entries(texts)) {
    for (const [key, value] of Object.entries(entries)) {
      assert.ok(read(file).includes(`"${key}": "${value}"`), `${file}: ${key}`);
    }
  }
});
