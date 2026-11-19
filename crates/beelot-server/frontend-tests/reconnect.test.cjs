"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const reconnect = require("../static/reconnect.js");

test("the missed moves are the rise of the table's version, never below zero", () => {
  assert.equal(reconnect.missedMoves(5, 8), 3);
  assert.equal(reconnect.missedMoves(5, 5), 0);
  assert.equal(reconnect.missedMoves(8, 5), 0);
  assert.equal(reconnect.missedMoves(undefined, 5), 0);
  assert.equal(reconnect.missedMoves(5, NaN), 0);
});

test("the line says nothing for none, and one move or several otherwise", () => {
  assert.equal(reconnect.missedLine(0), null);
  assert.equal(reconnect.missedLine(-2), null);
  assert.equal(reconnect.missedLine("3"), null);
  assert.deepEqual(reconnect.missedLine(1), { key: "You missed 1 move", n: 1 });
  assert.deepEqual(reconnect.missedLine(3), { key: "You missed {n} moves", n: 3 });
});

test("the button waits ten seconds and the line stays five", () => {
  assert.equal(reconnect.BUTTON_DELAY_MS, 10000);
  assert.equal(reconnect.MISSED_LINE_MS, 5000);
});

test("the page loads the rules before the app", () => {
  const html = fs.readFileSync(path.join(__dirname, "../static/index.html"), "utf8");
  const rules = html.indexOf('<script src="/reconnect.js"></script>');
  assert.ok(rules > 0 && rules < html.indexOf('<script src="/app-core.js"></script>'));
});
