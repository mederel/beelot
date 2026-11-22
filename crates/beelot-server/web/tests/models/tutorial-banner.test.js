import { test } from "vitest";
import assert from "node:assert/strict";
import { TUTORIAL_SEEN_KEY, shouldShowTutorialBanner, tutorialSeen, markTutorialSeen } from "$lib/models/prefs";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};
const throwingStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  }
};

test("the banner shows only to a guest who has not seen the tutorial", () => {
  assert.equal(shouldShowTutorialBanner({ seen: false, signedIn: false }), true);
  assert.equal(shouldShowTutorialBanner({ seen: true, signedIn: false }), false);
  assert.equal(shouldShowTutorialBanner({ seen: false, signedIn: true }), false);
  assert.equal(shouldShowTutorialBanner({ seen: true, signedIn: true }), false);
});

test("seen is remembered on the device", () => {
  const storage = memoryStorage();
  assert.equal(TUTORIAL_SEEN_KEY, "beelot.tutorial-seen");
  assert.equal(tutorialSeen(storage), false);
  markTutorialSeen(storage);
  assert.equal(tutorialSeen(storage), true);
});

test("blocked storage never throws and counts as not seen", () => {
  assert.equal(tutorialSeen(throwingStorage), false);
  assert.doesNotThrow(() => markTutorialSeen(throwingStorage));
});
