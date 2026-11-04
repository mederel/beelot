const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { passHelp } = require("../static/table-status.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("Pass says what happens next, per variant and round", () => {
  assert.equal(passHelp({ variant: "CLASSIC", round: 1 }), "Pass: the next player may take the card.");
  assert.equal(passHelp({ variant: "CLASSIC", round: 2 }), "Pass: if all four players pass, the cards are dealt again.");
  assert.equal(passHelp({ variant: "CONTREE", round: 1 }), "Pass: you make no bid. If all four players pass, the cards are dealt again.");
});

const html = read("index.html");
const solo = html.slice(html.indexOf('data-view="bot-game"'), html.indexOf('data-view="bidding"'));
const auction = html.slice(html.indexOf('data-view="bidding"'), html.indexOf("</section>", html.indexOf('data-view="bidding"')));

test("the solo table has no floating reason bubble, the private table keeps its own", () => {
  assert.ok(!solo.includes("hand-reason"));
  assert.ok(html.includes('id="private-hand-reason"'));
});

test("Pass is explained under the buttons and linked to its button", () => {
  assert.match(auction, /<p class="bid-help" id="bid-help"/);
  assert.match(auction, /id="pass-bid-button"[^>]*aria-describedby="bid-help"/);
});

test("the turned card of the auction is large", () => {
  const css = read("styles.css");
  const rule = css.slice(css.indexOf("\n.bidding-card-table .upturned-card {"));
  assert.match(rule.slice(0, rule.indexOf("}")), /--cw: 76px;\s*--ch: 110px/);
});

test("the new texts are translated", () => {
  const keys = ["Take {0}", "Pass: the next player may take the card.", "Pass: if all four players pass, the cards are dealt again.",
    "Pass: you make no bid. If all four players pass, the cards are dealt again."];
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of keys) assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
  }
});
