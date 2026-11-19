const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const app = require("./app-source.cjs").appSource();
const css = read("styles.css");

const tableStart = html.indexOf('data-view="table"');
const tableView = html.slice(tableStart, html.indexOf('data-view="private"'));
const sheetStart = tableView.indexOf('id="auction-sheet"');

test("the sheet is a hidden region inside the table view, not a dialog", () => {
  assert.ok(sheetStart > -1);
  assert.match(tableView, /<section class="auction-sheet" id="auction-sheet" role="region" aria-labelledby="auction-title" hidden>/);
  assert.ok(!/<dialog[^>]*id="auction-sheet"/.test(tableView));
});

test("the sheet has every slot of the model", () => {
  for (const id of ["auction-title", "auction-history", "auction-hand", "auction-upturned", "auction-values", "auction-suits",
    "auction-trumps", "auction-reason", "auction-hint-reason", "auction-pass", "auction-take", "auction-bid", "auction-coinche"]) {
    assert.ok(tableView.includes(`id="${id}"`), id);
  }
});

test("the value and suit groups are named for the sheet and hold every choice", () => {
  assert.equal((tableView.match(/name="auction-value"/g) || []).length, 9);
  assert.equal((tableView.match(/name="auction-suit"/g) || []).length, 6);
  assert.ok(!tableView.includes('name="contract-value"') && !tableView.includes('name="contract-suit"'));
  assert.equal((tableView.match(/data-suit="[A-Z]+"/g) || []).length, 4);
});

test("the model script loads before the app", () => {
  assert.ok(html.indexOf('<script src="/auction-sheet.js">') > -1);
  assert.ok(html.indexOf('<script src="/auction-sheet.js">') < html.indexOf('<script src="/app.js">'));
});

test("the sheet is a bottom panel capped at 56% of the height", () => {
  assert.match(css, /\.auction-sheet\s*\{[^}]*max-height: 56dvh/);
  assert.match(css, /\.auction-sheet\s*\{[^}]*position: absolute/);
});

test("the new texts are translated", () => {
  for (const text of ["Your call", "Take {0}?", "Bid {0}", "Bid more than {0}", "No higher bid is possible: pass or coinche",
    "That suit was passed on the first round", "Waiting for {0}…", "Bidding so far"]) {
    assert.ok(read("i18n.js").includes(`"${text}"`), `fr ${text}`);
    assert.ok(read("i18n-nl.js").includes(`"${text}"`), `nl ${text}`);
  }
});

const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));

test("the auction is drawn on the card table only", () => {
  assert.ok(app.includes("const auctionScreens = {"));
  const screens = slice("const auctionScreens = {", "async function loadAuction");
  assert.ok(screens.includes('prefix: "tbl"') && screens.includes("#tbl-hand"));
  assert.ok(!screens.includes("legacy") && !screens.includes('prefix: "bidding"'));
  assert.ok(app.includes("async function loadAuction(gameId, known = null)"));
  assert.ok(!app.includes("loadBidding(") && !app.includes("reloadAuction(") && !app.includes("auctionScreen()"));
});

test("submitBid, the opening deal and the hint act on the sheet", () => {
  const submit = slice("async function submitBid", "// \"Play now\"");
  assert.ok(submit.includes("auctionScreens.table") && submit.includes("loadAuction(gameId)"));
  const deal = slice("async function playOpeningDeal", "async function submitBid");
  assert.ok(deal.includes("ui = auctionScreens.table") && deal.includes("ui.prefix") && deal.includes("ui.hand"));
  const hint = slice("function highlightHintBid", "async function askForHint");
  assert.ok(hint.includes("#auction-pass") && hint.includes("auction-value"));
  assert.ok(!hint.includes("pass-bid-button") && !hint.includes("contract-value"));
});

test("the sheet is drawn from the model and every choice is wired", () => {
  const draw = slice("function renderAuctionSheet", "function syncAuctionChoices");
  assert.ok(draw.includes("auctionSheet("));
  for (const id of ["#auction-title", "#auction-history", "#auction-upturned", "#auction-hand", "#auction-values", "#auction-suits",
    "#auction-trumps", "#auction-take", "#auction-bid", "#auction-pass", "#auction-coinche", "#auction-reason"]) {
    assert.ok(draw.includes(id), id);
  }
  assert.ok(draw.includes('setAttribute("aria-describedby", "auction-reason")'));
  for (const call of ['submitBid("pass")', 'submitBid("trump", { suit: auctionTakeSuit })', 'submitBid("coinche")']) {
    assert.ok(app.includes(call), call);
  }
  assert.ok(app.includes('submitBid("contract", {\n  value: Number(choiceValue("auction-value")),\n  suit: choiceValue("auction-suit")'));
  assert.ok(!draw.includes("contract-value") && !draw.includes("contract-suit"));
});

test("a reason says why a choice is disabled, else what passing means", () => {
  const reason = slice("function auctionReason", "for (const name of");
  assert.ok(reason.includes("model.pass.reason") && reason.includes("model.bid?.reason") && reason.includes("passHelp("));
});

test("the table's auction keeps hand-off, hints, the leave state and the score bar", () => {
  const body = slice("async function loadAuction(gameId, known = null)", "async function renderSolo");
  assert.ok(body.includes("handOff(game, humanName)"));
  assert.ok(body.includes('offerHint("#table-hint-button"'));
  assert.ok(body.includes('leaveState = { kind: online ? "online" : "solo", matchComplete: false }'));
  assert.ok(body.includes("showScoreBar("));
  assert.ok(body.includes("setAuctionPhase(true)"));
  assert.ok(body.includes("navigate(`/play/bot/game/${gameId}`)"));
  assert.ok(body.includes("playOpeningDeal(game, bidding, currentPlayerIndex, ui)"));
});

test("the game phase hides the sheet, and the sheet hides while the cards are dealt", () => {
  assert.ok(app.includes("setAuctionPhase(false);"));
  assert.match(css, /\.auction-sheet\.dealing\s*\{\s*visibility: hidden/);
  assert.match(css, /\.auction-phase \.trick-progress\s*\{\s*display: none/);
});

test("a round and a rematch return to the auction route", () => {
  assert.ok(app.includes("navigate(`/play/bot/bidding/${gameId}`)"));
});

test("the backlog says what shipped and that the old bidding view is gone", () => {
  const backlog = fs.readFileSync(path.join(__dirname, "../../../docs/product-backlog.md"), "utf8");
  const story = backlog.slice(backlog.indexOf("**US-120"), backlog.indexOf("**US-121"));
  assert.ok(story.includes("Delivered:") && story.includes("2026-11-07-auction-sheet-design.md"));
  assert.ok(story.includes("US-160"));
});
