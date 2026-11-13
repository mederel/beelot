const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveEffectsLevel } = require("../static/effects.js");

test("a stored choice beats the system setting", () => {
  assert.equal(resolveEffectsLevel("off", null), "off");
  assert.equal(resolveEffectsLevel("reduced", null), "reduced");
  assert.equal(resolveEffectsLevel("full", null), "full");
});

test("without a stored choice the table is Full: the system's reduce-motion preference is never read", () => {
  assert.equal(resolveEffectsLevel(null, null), "full");
  // A third argument (the old system flag) changes nothing.
  assert.equal(resolveEffectsLevel(null, null, true), "full");
  assert.equal(resolveEffectsLevel(undefined, undefined, true), "full");
});

test("an invalid stored value is treated as unset", () => {
  assert.equal(resolveEffectsLevel("banana", null, true), "full");
  assert.equal(resolveEffectsLevel("banana", null), "full");
});

test("the legacy reduce-motion key migrates to reduced", () => {
  assert.equal(resolveEffectsLevel(null, "true"), "reduced");
  assert.equal(resolveEffectsLevel(null, "false"), "full");
});

test("the new key wins over the legacy key", () => {
  assert.equal(resolveEffectsLevel("full", "true"), "full");
});

const fs = require("node:fs");
const path = require("node:path");

test("no script reads the system's reduce-motion preference", () => {
  for (const name of fs.readdirSync(path.join(__dirname, "../static")).filter((file) => /\.(js|css|html)$/.test(file))) {
    const source = fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
    assert.ok(!source.includes("prefers-reduced-motion"), name);
  }
});
