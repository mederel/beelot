const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { routeFor } = require("../static/router.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const app = require("./app-source.cjs").appSource();
const html = read("index.html");
const css = read("styles.css");

test("online routes open the table view in the online phase", () => {
  for (const base of ["/online/private", "/online/public"]) {
    assert.deepEqual(routeFor(`${base}/table/x`), { view: "table", tab: null, sheet: null, phase: "online", params: { id: "x" } });
  }
  assert.equal(routeFor("/online/private").view, "private");
});

test("the table view holds the lobby sheet and the reaction tray", () => {
  const view = html.slice(html.indexOf('data-view="table"'), html.indexOf('data-view="bidding"'));
  for (const id of ["lobby-sheet", "lobby-code", "lobby-seats", "lobby-ready", "lobby-start", "lobby-start-bots", "lobby-leave",
    "lobby-rules", "tbl-reactions-toggle", "tbl-reaction-tray", "tbl-reaction-layer"]) {
    assert.ok(view.includes(`id="${id}"`), id);
  }
  assert.equal((view.match(/class="reaction-button"/g) ?? []).length, 6);
  assert.match(view, /id="tbl-reactions-toggle"[^>]*aria-expanded="false"/);
});

test("lobby-model.js loads before app.js, and the lobby inputs do not clash with the old view", () => {
  assert.ok(html.indexOf('src="/lobby-model.js"') < html.indexOf('src="/app.js"'));
  const view = html.slice(html.indexOf('data-view="table"'), html.indexOf('data-view="bidding"'));
  assert.ok(!/name="(turn-timer|table-announcements|table-all-trumps|table-target)"/.test(view));
});

test("the old private table is shown for the online routes only under the flag", () => {
  assert.match(app, /if \(phase === "online"\) return "private-table";/);
  assert.ok(app.includes("function onlineTable()"));
  assert.ok(app.includes("async function loadOnlineTable(tableId, { fresh = false } = {})"));
  assert.ok(app.includes("function renderLobby(snapshot)"));
  assert.ok(app.includes("if (onlineTable()) loadOnlineTable(currentRouteId());"));
});

test("the online table feeds the shared renderers with the snapshot it holds", () => {
  const body = app.slice(app.indexOf("async function loadOnlineTable"), app.indexOf("function lobbySeat"));
  assert.ok(body.includes("renderSolo(tableId, soloScreens.table, snapshot)"));
  assert.ok(body.includes("loadAuction(tableId, snapshot)"));
  assert.ok(body.includes("openTableStream(tableId)"));
  assert.ok(body.includes('leaveState = { kind: "online"'));
  assert.ok(app.includes("async function renderSolo(gameId, ui, known = null)"));
});

test("online, the server collects tricks, bids and rounds stay on the table, hints and deals are off", () => {
  assert.match(app, /if \(online\) \{\s*loadOnlineTable\(gameId, \{ fresh: true \}\);/);
  const submit = app.slice(app.indexOf("async function submitBid"), app.indexOf("async function submitBid") + 400);
  assert.ok(submit.includes("onlineAction(gameId"));
  assert.ok(app.includes('onlineAction(gameId, { type: "nextRound" })'));
  assert.ok(app.includes('onlineAction(gameId, { type: "rematch" })'));
  assert.ok(app.includes("!online && snapshot.table.hints"));
  assert.ok(app.includes("const animateDeal = !online &&"));
});

test("the stream reloads the new table and the leave link follows the mode", () => {
  assert.ok(app.includes("else if (onlineTable() && currentRouteId() === tableId) {"));
  assert.ok(app.includes("loadOnlineTable(tableId);"));
  assert.ok(app.includes('document.querySelector(".table-menu-leave").setAttribute("href", tableExitPath())'));
  assert.ok(app.includes('return onlineTable() ? tableHomePath() : "/play/bot";'));
  assert.ok(app.includes("if (activeView !== \"private-table\" && !onlineTable()) closeTableStream();"));
});

test("reactions are sent from the tray and shown next to the table's seats", () => {
  assert.ok(app.includes('#tbl-reaction-tray .reaction-button'));
  assert.ok(app.includes('[id^="tbl-player-"]'));
  assert.ok(app.includes('"#tbl-reaction-layer"'));
  assert.match(css, /\.reaction-toggle\s*\{/);
  assert.match(css, /\.reaction-tray\s*\{/);
});

test("the lobby sheet is styled and its new texts are translated", () => {
  assert.match(css, /\.lobby-sheet\s*\{/);
  for (const key of ["Share", "Join my Beelot table: code {0}", "Table rules", "Open reactions"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
