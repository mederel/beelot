import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveEffectsLevel } from "$lib/models/prefs";

test("a stored choice beats the system setting", () => {
  assert.equal(resolveEffectsLevel("off", null), "off");
  assert.equal(resolveEffectsLevel("reduced", null), "reduced");
  assert.equal(resolveEffectsLevel("full", null), "full");
});

test("without a stored choice the table is Full, or Reduced when the system asks for less motion (US-207)", () => {
  assert.equal(resolveEffectsLevel(null, null), "full");
  assert.equal(resolveEffectsLevel(null, null, false), "full");
  assert.equal(resolveEffectsLevel(null, null, true), "reduced");
  assert.equal(resolveEffectsLevel(undefined, undefined, true), "reduced");
});

test("a stored choice of the player wins over the system's request", () => {
  assert.equal(resolveEffectsLevel("full", null, true), "full");
  assert.equal(resolveEffectsLevel("off", null, true), "off");
  assert.equal(resolveEffectsLevel("reduced", null, false), "reduced");
});

test("an invalid stored value is treated as unset", () => {
  assert.equal(resolveEffectsLevel("banana", null, true), "reduced");
  assert.equal(resolveEffectsLevel("banana", null), "full");
});

test("the legacy reduce-motion key migrates to reduced", () => {
  assert.equal(resolveEffectsLevel(null, "true"), "reduced");
  assert.equal(resolveEffectsLevel(null, "false"), "full");
});

test("the new key wins over the legacy key", () => {
  assert.equal(resolveEffectsLevel("full", "true"), "full");
});
