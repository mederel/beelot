const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { roundPointsText } = require("../static/score-bar.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("round points read with their label, and nothing when no round is in progress", () => {
  assert.equal(roundPointsText(55, "manche", String), "+55 manche");
  assert.equal(roundPointsText(0, "manche", String), "+0 manche");
  assert.equal(roundPointsText(null, "manche", String), "");
  assert.equal(roundPointsText(undefined, "manche", String), "");
});

test("the number is formatted by the caller", () => {
  assert.equal(roundPointsText(1250, "round", (n) => n.toLocaleString("en-US")), "+1,250 round");
});

test("the tooltip is gone: the label is real text", () => {
  assert.ok(!read("app.js").includes("round.title"));
  for (const file of ["i18n.js", "i18n-nl.js"]) assert.ok(!read(file).includes('"Round points"'), file);
});

test("the label is translated", () => {
  assert.match(read("i18n.js"), /"round": "manche"/);
  assert.match(read("i18n-nl.js"), /"round": "ronde"/);
});
