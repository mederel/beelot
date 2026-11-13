const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const app = require("./app-source.cjs").appSource();
const html = read("index.html");

test("the table bar has an Undo button, hidden until a card is played", () => {
  assert.match(html, /<button class="table-undo" id="table-undo-button" type="button" hidden>Undo<\/button>/);
  assert.match(read("styles.css"), /\.table-undo\[hidden\] \{ display: none; \}/);
});

test("the button follows the snapshot, solo only, and shows the undos left", () => {
  assert.ok(app.includes("offerUndo(gameId, !online && !game.passAndPlay && snapshot.table.undoOffered, snapshot.table.undosLeft,"));
  assert.ok(app.includes('button.textContent = t("Undo ({0} left)", left);'));
  assert.ok(app.includes("if (!offered || !left) {"));
});

test("it goes away after a few seconds and a click asks the server to undo", () => {
  assert.ok(app.includes("const undoShownMs = 7000;"));
  assert.ok(app.includes("undoTimer = window.setTimeout(hideUndo, undoShownMs);"));
  assert.ok(app.includes('await api.act(gameId, { type: "undo" });'));
  assert.ok(app.includes('pendingTrickCollection = "";'));
});

test("the new text is translated", () => {
  assert.ok(read("i18n.js").includes('"Undo ({0} left)":'));
  assert.ok(read("i18n-nl.js").includes('"Undo ({0} left)":'));
});
