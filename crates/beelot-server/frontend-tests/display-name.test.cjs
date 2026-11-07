const test = require("node:test");
const assert = require("node:assert/strict");
const { checkDisplayName } = require("../static/display-name.js");

test("a name is trimmed", () => {
  assert.deepEqual(checkDisplayName("  Mimi  "), { ok: true, name: "Mimi" });
});

test("an empty name is refused", () => {
  assert.equal(checkDisplayName("   ").ok, false);
});

test("thirty characters fit and thirty-one do not, counting emoji as one", () => {
  assert.equal(checkDisplayName("a".repeat(30)).ok, true);
  assert.equal(checkDisplayName("a".repeat(31)).ok, false);
  assert.equal(checkDisplayName("🐝".repeat(30)).ok, true);
});
