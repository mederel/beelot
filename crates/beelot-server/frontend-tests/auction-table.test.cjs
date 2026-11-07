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
