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

test("the auction on the table is its own screen next to the old one", () => {
  assert.ok(app.includes("const auctionScreens = {"));
  const screens = slice("const auctionScreens = {", "function auctionScreen()");
  assert.ok(screens.includes('prefix: "bidding"') && screens.includes('prefix: "tbl"'));
  assert.ok(screens.includes("#bidding-hand") && screens.includes("#tbl-hand"));
  assert.ok(app.includes("async function loadAuction(gameId)"));
  assert.ok(app.includes("async function loadBidding(gameId)"));
  assert.ok(app.includes("function reloadAuction(gameId)"));
});

test("submitBid, the opening deal and the hint act on the screen in use", () => {
  const submit = slice("async function submitBid", "// \"Play now\"");
  assert.ok(submit.includes("auctionScreen()") && submit.includes("reloadAuction(gameId)"));
  assert.ok(!submit.includes('"bidding"') && !submit.includes("loadBidding("));
  const deal = slice("async function playOpeningDeal", "async function submitBid");
  assert.ok(deal.includes("ui = auctionScreens.legacy") && deal.includes("ui.prefix") && deal.includes("ui.hand"));
  const hint = slice("function highlightHintBid", "async function askForHint");
  assert.ok(hint.includes("#auction-pass") && hint.includes("#pass-bid-button"));
  assert.ok(hint.includes("auction-value") && hint.includes("contract-value"));
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
  const body = slice("async function loadAuction(gameId)", "async function renderSolo");
  assert.ok(body.includes("handOff(game, humanName)"));
  assert.ok(body.includes('offerHint("#table-hint-button"'));
  assert.ok(body.includes('leaveState = { kind: "solo", matchComplete: false }'));
  assert.ok(body.includes("showScoreBar("));
  assert.ok(body.includes("setAuctionPhase(true)"));
  assert.ok(body.includes("navigate(`/play/bot/game/${gameId}`)"));
  assert.ok(body.includes("playOpeningDeal(game, bidding, currentPlayerIndex, ui)"));
});

test("the game phase hides the sheet, and the sheet hides while the cards are dealt", () => {
  assert.ok(app.includes("if (onTable) setAuctionPhase(false);"));
  assert.match(css, /\.auction-sheet\.dealing\s*\{\s*visibility: hidden/);
  assert.match(css, /\.auction-phase \.trick-progress\s*\{\s*display: none/);
});

test("a round and a rematch return to the auction route", () => {
  assert.ok(app.includes("navigate(`/play/bot/bidding/${gameId}`)"));
});

test("the README and the backlog say the flag covers the auction and what shipped", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../../../README.md"), "utf8");
  assert.ok(readme.includes("?table=legacy") && readme.includes("US-120"));
  const backlog = fs.readFileSync(path.join(__dirname, "../../../docs/product-backlog.md"), "utf8");
  const story = backlog.slice(backlog.indexOf("**US-120"), backlog.indexOf("**US-121"));
  assert.ok(story.includes("Delivered:") && story.includes("2026-11-07-auction-sheet-design.md"));
});
