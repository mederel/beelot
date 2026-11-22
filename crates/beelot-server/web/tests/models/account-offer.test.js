import { test } from "vitest";
import assert from "node:assert/strict";
import { OFFER_KEY, emptyOffer, countMatch, shouldOffer, dismissOffer, loadOffer, saveOffer } from "$lib/models/account-offer";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

test("a guest is offered an account at the first finished match, a signed-in player never", () => {
  const state = countMatch(emptyOffer(), "bot:1:1000-800");
  assert.equal(shouldOffer(state, false), true);
  assert.equal(shouldOffer(state, true), false);
});

test("a match is counted once", () => {
  let state = countMatch(emptyOffer(), "a");
  state = countMatch(state, "a");
  assert.equal(state.matches, 1);
  assert.equal(countMatch(state, "b").matches, 2);
});

test("a dismissed offer stays away for three more matches", () => {
  let state = dismissOffer(countMatch(emptyOffer(), "a"));
  assert.equal(shouldOffer(state, false), false);
  state = countMatch(state, "b");
  state = countMatch(state, "c");
  assert.equal(shouldOffer(state, false), false);
  state = countMatch(state, "d");
  assert.equal(shouldOffer(state, false), true);
});

test("the state lives on the device; corrupt or blocked storage never throws", () => {
  const storage = memoryStorage();
  assert.equal(OFFER_KEY, "beelot.account-offer");
  saveOffer(storage, dismissOffer(countMatch(emptyOffer(), "a")));
  assert.deepEqual(loadOffer(storage), { matches: 1, dismissedAt: 1, last: "a" });
  storage.setItem(OFFER_KEY, "{nope");
  assert.deepEqual(loadOffer(storage), emptyOffer());
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadOffer(blocked), emptyOffer());
  assert.doesNotThrow(() => saveOffer(blocked, emptyOffer()));
});
