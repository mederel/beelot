const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("./app-source.cjs").appSource();

test("the event stream's URL never carries the player token", () => {
  const open = app.slice(app.indexOf("function openTableStream("), app.indexOf("// The \"Reconnect now\" button"));
  assert.ok(open.length > 100, "openTableStream is found");
  assert.doesNotMatch(open, /events\?token=/);
  assert.match(open, /stream-ticket/);
  assert.match(open, /events\?ticket=/);
});
