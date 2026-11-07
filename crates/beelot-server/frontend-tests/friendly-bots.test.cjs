const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "static", "app.js"), "utf8");

test("the table shows greetings and comments through the pure helpers", () => {
  assert.ok(app.includes("commentFor("), "commentFor");
  assert.ok(app.includes("greetingFor("), "greetingFor");
  assert.ok(!app.includes("pickLine("), "pickLine is only used inside bot-lines.js");
  assert.ok(app.includes("trickShown"), "comment state has trickShown");
});

test("the bot game passes the match to the expression state", () => {
  assert.ok(app.includes('updateBidding(ui.prefix, seats, snapshot.bidding, match)'));
  assert.ok(app.includes('updateBidding("private", seats, snapshot.bidding, match)'));
});

test("greeted games are remembered in sessionStorage, guarded", () => {
  const start = app.indexOf("function commentOnEvents");
  const body = app.slice(start - 1500, start + 1800);
  assert.ok(body.includes("beelot.greeted"));
  assert.ok(/try\s*{[^}]*sessionStorage/.test(body));
});
