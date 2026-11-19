// US-160: the old solo table, bidding view and online table are gone; one table serves every game.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = require("./app-source.cjs").appSource();
const css = read("styles.css");

test("the page has no view of the old table, bidding or online table", () => {
  for (const view of ["bot-game", "bidding", "private-table"]) {
    assert.ok(!html.includes(`data-view="${view}"`), view);
  }
  assert.ok(html.includes('data-view="table"'));
});

test("no private-* id is left in the page, the scripts or the styles", () => {
  assert.doesNotMatch(html, /id="private-(?!form-message)/);
  assert.doesNotMatch(app, /#private-(?!form-message)/);
  assert.doesNotMatch(css, /#private-|\.private-game|\.private-card-table|\[data-view="(bot-game|bidding|private-table)"\]/);
});

test("the legacy switches and helpers are deleted", () => {
  for (const gone of ["legacyTable", "applyTableFlag", "loadBotGame", "loadBidding", "loadPrivateTable", "privateAction",
    "soloScreens.legacy", "auctionScreens.legacy", "soloScreen()", "auctionScreen()"]) {
    assert.ok(!app.includes(gone), gone);
  }
  assert.ok(!/\?table=|searchParams\.get\("table"\)/.test(app));
});

test("every id the scripts look up by selector is in the page", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, id] of app.matchAll(/querySelector(?:All)?\(\s*["'`]#([A-Za-z0-9_-]+)/g)) assert.ok(ids.has(id), id);
});

test("a device that holds the old flag loses it, and storage that throws is no problem", () => {
  const start = app.indexOf("// A device that still holds the flag");
  const body = app.slice(start, app.indexOf("function viewForPath"));
  assert.ok(start > -1);
  const removed = [];
  vm.runInNewContext(body, { window: { localStorage: { removeItem: (key) => removed.push(key) } } });
  assert.deepEqual(removed, ["beelot.legacy-table"]);
  assert.doesNotThrow(() => vm.runInNewContext(body, { window: { localStorage: { removeItem() { throw new Error("blocked"); } } } }));
});

test("the address decides the view, not the query or the storage", () => {
  const body = app.slice(app.indexOf("function viewForPath"), app.indexOf("// Whether the address is an online table"));
  assert.match(body, /return routeFor\(path\)\.view;/);
  assert.ok(!body.includes("localStorage"));
  const { routeFor } = require("../static/router.js");
  assert.equal(routeFor("/play/bot/game/abc").view, "table");
  assert.equal(routeFor("/online/private/table/abc").view, "table");
});

test("the README does not mention the flag, and the stories say the views were removed", () => {
  const root = path.join(__dirname, "../../..");
  assert.ok(!fs.readFileSync(path.join(root, "README.md"), "utf8").includes("?table=legacy"));
  const backlog = fs.readFileSync(path.join(root, "docs/product-backlog.md"), "utf8");
  for (const id of ["US-119", "US-120", "US-121"]) {
    const from = backlog.indexOf(`**${id} `);
    const story = backlog.slice(from, backlog.indexOf("\n**US-", from + 5));
    assert.ok(story.includes("US-160"), id);
  }
});
