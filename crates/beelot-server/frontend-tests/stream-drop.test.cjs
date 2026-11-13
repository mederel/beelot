const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("./app-source.cjs").appSource();

const stream = app.slice(app.indexOf("let tableStream = null;"), app.indexOf("// The score bar above the table"));

test("a stream that stays down for a few seconds shows the connection note", () => {
  assert.match(stream, /const streamDropNoteDelay = 3000;/);
  assert.match(stream, /streamDropped = true;\s*showConnectionTrouble\(true\);/);
});

test("only the first error of a drop starts the note's timer, so repeated errors do not postpone it", () => {
  assert.match(stream, /if \(!streamDropTimer && !streamDropped\)/);
});

test("the note stays up while the stream is reopened and goes when it opens again", () => {
  assert.match(stream, /closeTableStream\(\{ keepNote: true \}\)/);
  assert.match(stream, /const wasDropped = streamDropped;\s*clearStreamDropNote\(\);\s*if \(wasDropped\) resyncAfterReconnect\(\);/);
});

test("leaving the table, or a refusal by the server, removes the note", () => {
  assert.match(stream, /if \(!keepNote\) clearStreamDropNote\(\);/);
  assert.match(stream, /stream\.refused = true;\s*source\.close\(\);\s*clearStreamDropNote\(\);/);
});
