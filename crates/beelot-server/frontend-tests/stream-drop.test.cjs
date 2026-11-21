const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = require("./source.cjs").source("app-core.js", "app-session.js");
const reconnect = fs.readFileSync(path.join(__dirname, "../static/reconnect.js"), "utf8");

// The behaviour of the gaps is tested with a fake clock in stream-reconnect.test.cjs; these check the wiring (US-142, US-163).
const stream = app.slice(app.indexOf("let tableStream = null;"), app.indexOf("// The score bar above the table"));

test("a stream that stays down for a few seconds shows the connection note", () => {
  assert.match(reconnect, /const NOTE_DELAY_MS = 3000;/);
  assert.match(stream, /note: \(on\) => showConnectionTrouble\(on\),/);
});

test("every error of a drop goes to the tracker, which keeps only the first one's timers", () => {
  assert.match(stream, /streamGap\.failed\(\);/);
  assert.match(reconnect, /if \(active\) \{/);
});

test("the note stays up while the stream is reopened and goes when it opens again", () => {
  assert.match(stream, /closeTableStream\(\{ keepNote: true \}\)/);
  assert.match(stream, /const ticket = streamGap\.opened\(\);\s*if \(ticket\) resyncAfterReconnect\(\)/);
});

test("leaving the table, or a refusal by the server, removes the note", () => {
  assert.match(stream, /if \(!keepNote\) streamGap\.cleared\(\);/);
  assert.match(stream, /stream\.refused = true;\s*source\.close\(\);\s*streamGap\.cleared\(\);/);
});

test("an answer to an ordinary request does not hide the note while the stream is down", () => {
  assert.match(app, /if \(!streamGap\.isDropped\(\)\) showConnectionTrouble\(false\);/);
});
