import { test } from "vitest";
import assert from "node:assert/strict";
import { PACES, BASE_DELAYS, resolvePace, paceDelay } from "$lib/models/prefs";


test("every delay is its base times the pace, rounded", () => {
  assert.equal(paceDelay("biddingThink", "normal"), 900);
  assert.equal(paceDelay("biddingThink", "quick"), 450);
  assert.equal(paceDelay("biddingThink", "relaxed"), 1350);
  for (const name of Object.keys(BASE_DELAYS)) {
    for (const pace of Object.keys(PACES)) assert.equal(paceDelay(name, pace), Math.round(BASE_DELAYS[name] * PACES[pace]));
  }
});

test("quick is shorter than normal, relaxed longer, and no delay becomes zero", () => {
  for (const name of Object.keys(BASE_DELAYS)) {
    assert.ok(paceDelay(name, "quick") > 0, name);
    assert.ok(paceDelay(name, "quick") < paceDelay(name, "normal"), name);
    assert.ok(paceDelay(name, "relaxed") > paceDelay(name, "normal"), name);
  }
});

test("an unknown or missing pace is the normal one, an unknown delay is an error", () => {
  assert.equal(resolvePace(null), "normal");
  assert.equal(resolvePace("fast"), "normal");
  assert.equal(resolvePace("constructor"), "normal");
  assert.equal(paceDelay("ownCall", undefined), 1000);
  assert.throws(() => paceDelay("nope", "normal"));
});
