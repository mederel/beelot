const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = require("./app-source.cjs").appSource();
const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("every request is given up after a timeout and marked as a network failure", () => {
  assert.match(app, /const requestTimeoutMs = \d+;/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /error\.network = true/);
});

test("only reads are repeated; a move is never sent twice", () => {
  const api = app.slice(app.indexOf("async function apiJson(url"), app.indexOf("let connectionRetryTimer"));
  assert.match(api, /\.toUpperCase\(\) === "GET"/);
  assert.match(api, /!readOnly/);
});

test("a move without an answer is checked against the table before it is reported lost", () => {
  const act = app.slice(app.indexOf("async act(tableId, action)"), app.indexOf("// The newest snapshot known"));
  assert.match(act, /fresh\.version > known/);
});

test("a failed load keeps the player at the table and loads again, in every loader", () => {
  assert.equal((app.match(/if \(retryOnNetworkError\(error,/g) || []).length, 5);
});

test("the player is told the connection is being retried, and the table is read again when it returns", () => {
  assert.match(read("index.html"), /id="connection-note" role="status" hidden>The connection is slow or lost\. Retrying…</);
  assert.match(read("offline.js"), /function showConnectionTrouble\(on\)/);
  assert.match(app, /window\.addEventListener\("online", resyncAfterReconnect\)/);
  assert.match(app, /visibilityState === "visible"/);
});

test("the new sentences are translated", () => {
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    assert.match(read(file), /"The connection is slow or lost\. Retrying…"/);
    assert.match(read(file), /"The connection is slow or lost\."/);
  }
});
