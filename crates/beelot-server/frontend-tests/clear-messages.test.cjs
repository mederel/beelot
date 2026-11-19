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

test("the new texts are translated", () => {
  const keys = ["Take {0}", "Pass: the next player may take the card.", "Pass: if all four players pass, the cards are dealt again.",
    "Pass: you make no bid. If all four players pass, the cards are dealt again."];
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of keys) assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
  }
});
