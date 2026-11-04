const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { leaveConfirmation } = require("../static/leave-confirm.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("a solo or pass-and-play match in progress says the game is abandoned", () => {
  assert.deepEqual(leaveConfirmation({ kind: "solo", matchComplete: false }),
    { title: "Leave this table?", message: "The game will be abandoned." });
});

test("an online match in progress says a bot takes over the seat", () => {
  assert.deepEqual(leaveConfirmation({ kind: "online", matchComplete: false }),
    { title: "Leave this table?", message: "If you stay away, a bot will take over your seat." });
});

test("nothing to confirm once the match is over or when no table is being played", () => {
  assert.equal(leaveConfirmation({ kind: "solo", matchComplete: true }), null);
  assert.equal(leaveConfirmation({ kind: "online", matchComplete: true }), null);
  assert.equal(leaveConfirmation({ kind: null, matchComplete: false }), null);
});

const html = read("index.html");
const dialog = html.slice(html.indexOf('<dialog class="leave-dialog"'), html.indexOf("</dialog>"));

test("the dialog is labelled, Stay comes first and has the focus, Leave is a danger button", () => {
  assert.match(dialog, /<dialog class="leave-dialog" id="leave-dialog" aria-labelledby="leave-dialog-title" aria-describedby="leave-dialog-message">/);
  assert.ok(dialog.indexOf('id="leave-stay-button"') > 0 && dialog.indexOf('id="leave-stay-button"') < dialog.indexOf('id="leave-confirm-button"'));
  assert.match(dialog, /<button class="button" id="leave-stay-button"[^>]*autofocus[^>]*>Stay<\/button>/);
  assert.match(dialog, /<button class="button danger-button" id="leave-confirm-button"[^>]*>Leave<\/button>/);
});

test("the solo menu and the online table links ask first", () => {
  assert.match(html, /<a class="table-menu-leave" data-confirm-leave="solo" href="\/play\/bot">Leave table<\/a>/);
  assert.match(html, /<a class="button" data-confirm-leave="online" href="\/online\/private" id="leave-table-link">Leave table<\/a>/);
});

test("the script loads before app.js and the texts are translated", () => {
  assert.ok(html.indexOf("/leave-confirm.js") > 0 && html.indexOf("/leave-confirm.js") < html.indexOf("/app.js"));
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of ["Leave this table?", "The game will be abandoned.", "If you stay away, a bot will take over your seat.", "Stay", "Leave"]) {
      assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
    }
  }
});
