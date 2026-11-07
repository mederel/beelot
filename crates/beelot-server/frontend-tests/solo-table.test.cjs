const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = read("app.js");
const css = read("styles.css");

const tableStart = html.indexOf('data-view="table"');
const tableView = html.slice(tableStart, html.indexOf('data-view="bidding"'));

test("the table view comes after the bot game view and has every slot", () => {
  assert.ok(html.indexOf('data-view="bot-game"') < tableStart);
  for (const id of ["tbl-title", "tbl-card-table", "tbl-player-top", "tbl-player-left", "tbl-player-right", "tbl-player-bottom",
    "tbl-completed-tricks", "tbl-current-trick", "tbl-hand", "tbl-toasts", "tbl-chips", "tbl-declare", "tbl-chip-list",
    "tbl-round-result", "tbl-contract-result", "tbl-round-score-breakdown", "tbl-next-round-button", "tbl-rematch-button",
    "tbl-results-button", "tbl-review-button"]) {
    assert.ok(tableView.includes(`id="${id}"`), id);
  }
});

test("messages are a status region and the declare option is a switch button", () => {
  assert.match(tableView, /id="tbl-toasts" role="status" aria-label="Table messages"/);
  assert.match(tableView, /<button[^>]*id="tbl-declare"[^>]*role="switch"/);
});

test("the table view has no checkbox, announcements panel, hint line or game heading", () => {
  for (const old of ["declare-option", "announcements-panel", "game-heading", "hint-reason", 'type="checkbox"']) {
    assert.ok(!tableView.includes(old), old);
  }
});

test("the old bot game view is still there behind the flag", () => {
  assert.ok(html.includes('data-view="bot-game"'));
  assert.ok(app.includes("function legacyTable()"));
  assert.ok(app.includes('"beelot.legacy-table"'));
  assert.match(app, /view === "table" && legacyTable\(\) \? "bot-game" : view/);
});

test("the flag is set by ?table=legacy and cleared by ?table=new", () => {
  const body = app.slice(app.indexOf("function applyTableFlag"), app.indexOf("function viewForPath"));
  assert.ok(body.includes('"legacy"') && body.includes('"new"'));
  assert.ok(body.includes("setItem") && body.includes("removeItem"));
  assert.ok(body.includes("history.replaceState"));
});

test("the toast and chip scripts load before the app", () => {
  const app_ = html.indexOf('<script src="/app.js">');
  assert.ok(html.indexOf('<script src="/toast.js">') > -1 && html.indexOf('<script src="/toast.js">') < app_);
  assert.ok(html.indexOf('<script src="/table-chips.js">') > -1 && html.indexOf('<script src="/table-chips.js">') < app_);
});

test("renderView loads the table for the table view and the old game for the old view", () => {
  assert.ok(app.includes('if (activeView === "table") loadTable(currentRouteId());'));
  assert.ok(app.includes('if (activeView === "bot-game") loadBotGame(currentRouteId());'));
  assert.ok(app.includes('const loadTable = (gameId) => renderSolo(gameId, soloScreens.table);'));
});

test("the new table draws its seats, hand and result through its own prefix and ids", () => {
  const screens = app.slice(app.indexOf("const soloScreens"), app.indexOf("function soloScreen()"));
  for (const part of ['prefix: "tbl"', "#tbl-hand", "#tbl-current-trick", "#tbl-round-result", '#tbl-card-table']) {
    assert.ok(screens.includes(part), part);
  }
  assert.ok(!/playSecondDeal[\s\S]{0,200}"#card-hand"/.test(app.slice(app.indexOf("async function playSecondDeal"), app.indexOf("async function playSecondDeal") + 300)));
});

test("toasts carry the declaration, the hint and the chip detail, and are cleared with the game", () => {
  assert.ok(app.includes("makeToaster("));
  assert.ok(app.includes('tableToaster.push(declaration, "declaration")'));
  assert.ok(app.includes('tableToaster.push(reason, "hint")'));
  assert.ok(app.includes('tableToaster.push(chip.detail, "detail")'));
  assert.ok(app.includes("resetTableToasts();"));
});

test("a card is played with the declare switch on the new table and the checkbox on the old one", () => {
  assert.ok(app.includes("declare: soloDeclareChoice()"));
  const body = app.slice(app.indexOf("function soloDeclareChoice"), app.indexOf("const loadBotGame"));
  assert.ok(body.includes("declareChoice(\"\")"));
  assert.ok(body.includes('getAttribute("aria-checked")'));
});

test("the table menu names the variant and the bots' difficulty", () => {
  assert.ok(html.includes('id="table-menu-game"'));
  assert.ok(app.includes('#table-menu-game'));
});

test("the screen fits the viewport and the round result lies over the hand", () => {
  assert.match(css, /\(min-height: 640px\)\s*\{\s*\.shell:has\(\[data-view="table"\]:not\(\[hidden\]\)\)\s*\{\s*height: 100dvh;\s*overflow: hidden;/);
  assert.match(css, /\.table-screen \.round-result\s*\{[^}]*position: absolute/);
});

test("the toast region's label is translated", () => {
  assert.ok(read("i18n.js").includes('"Table messages"'));
  assert.ok(read("i18n-nl.js").includes('"Table messages"'));
});
