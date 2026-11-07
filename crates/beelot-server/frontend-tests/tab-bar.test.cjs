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

test("the bar follows the logo, inside the shell", () => {
  const brand = html.indexOf('<a class="brand"');
  const bar = html.indexOf('<nav class="tab-bar"');
  assert.ok(brand > html.indexOf('<main class="shell"') && bar > brand && bar < html.indexOf('<div class="table-header"'));
});

test("the old Settings link is gone from the page and the script", () => {
  assert.doesNotMatch(html, /settings-link/);
  const app = require("./app-source.cjs").appSource();
  assert.doesNotMatch(app, /settings-link|settingsLink/);
});

test("renderView shows or hides the bar from the route's tab", () => {
  const app = require("./app-source.cjs").appSource();
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

const css = read("styles.css");

test("the stylesheet no longer styles the settings link", () => {
  assert.doesNotMatch(css, /settings-link/);
});

test("the bar is fixed to the bottom of a phone, above the safe area, and is a top navigation from 1024px", () => {
  const bar = css.match(/\n\.tab-bar \{[^}]*\}/)[0];
  assert.match(bar, /position: fixed/);
  assert.match(bar, /bottom: 0/);
  assert.match(bar, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.tab-bar\[hidden\] \{ display: none; \}/);
  const desktop = css.slice(css.indexOf("/* Tab bar (US-117) */"));
  assert.match(desktop, /@media \(min-width: 1024px\) \{[^@]*\.tab-bar \{[^}]*position: static/);
});

test("a tab is at least 44px high, the current one is marked, and the shell leaves room for the bar", () => {
  assert.match(css.match(/\n\.tab \{[^}]*\}/)[0], /min-height: 44px/);
  assert.match(css, /\.tab\[aria-current="page"\]/);
  assert.match(css, /\.shell:has\(#tab-bar:not\(\[hidden\]\)\)/);
});

test("one bar height drives the shell padding and the scroll padding", () => {
  assert.match(css, /--tab-bar-height: calc\([^;]*env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.shell:has\(#tab-bar:not\(\[hidden\]\)\) \{ padding-bottom: calc\(var\(--tab-bar-height\)/);
  assert.doesNotMatch(css, /padding-bottom: calc\(5\.5rem/);
  assert.match(css, /html:has\(#tab-bar:not\(\[hidden\]\)\) \{ scroll-padding-bottom: calc\(var\(--tab-bar-height\)/);
});
