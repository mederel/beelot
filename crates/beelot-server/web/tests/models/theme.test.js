import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveTheme, THEMES } from "$lib/models/prefs";

test("lists the four themes with comic first", () => {
  assert.deepEqual(THEMES, ["comic", "classic-green", "midnight", "sunset"]);
});

test("a stored known theme is kept", () => {
  for (const theme of THEMES) assert.equal(resolveTheme(theme), theme);
});

test("nothing stored means comic", () => {
  assert.equal(resolveTheme(null), "comic");
  assert.equal(resolveTheme(undefined), "comic");
});

test("an unknown stored value means comic", () => {
  assert.equal(resolveTheme("banana"), "comic");
  assert.equal(resolveTheme(""), "comic");
  assert.equal(resolveTheme("MIDNIGHT"), "comic");
});

import { LOCKED_THEMES, unlockedThemes, readUnlockedThemes, saveUnlockedThemes } from "$lib/models/prefs";
const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("three locked themes unlock from the totals of the goals ledger", () => {
  assert.deepEqual(Object.keys(LOCKED_THEMES), ["forest", "ruby", "gilded"]);
  assert.deepEqual(unlockedThemes({ played: 0, won: 0 }), []);
  assert.deepEqual(unlockedThemes(null), []);
  assert.deepEqual(unlockedThemes({ played: 1, won: 1 }), ["forest"]);
  assert.deepEqual(unlockedThemes({ played: 24, won: 10 }), ["forest", "ruby"]);
  assert.deepEqual(unlockedThemes({ played: 25, won: 10 }), ["forest", "ruby", "gilded"]);
});

test("an unlock already remembered stays even when the ledger is empty", () => {
  assert.deepEqual(unlockedThemes({ played: 0, won: 0 }, ["ruby"]), ["ruby"]);
  assert.deepEqual(unlockedThemes(null, ["gilded", "banana"]), ["gilded"]);
});

test("a locked theme is only kept once unlocked", () => {
  assert.equal(resolveTheme("forest"), "comic");
  assert.equal(resolveTheme("forest", []), "comic");
  assert.equal(resolveTheme("forest", ["forest"]), "forest");
  assert.equal(resolveTheme("ruby", ["forest"]), "comic");
  assert.equal(resolveTheme("constructor", ["constructor"]), "comic");
});

test("unlocks are remembered in the browser and blocked storage changes nothing", () => {
  const storage = memory();
  assert.deepEqual(readUnlockedThemes(storage), []);
  saveUnlockedThemes(storage, ["forest", "ruby"]);
  assert.deepEqual(readUnlockedThemes(storage), ["forest", "ruby"]);
  storage.setItem("beelot.unlocked-themes", "{oops");
  assert.deepEqual(readUnlockedThemes(storage), []);
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    }
  };
  assert.deepEqual(readUnlockedThemes(blocked), []);
  assert.doesNotThrow(() => saveUnlockedThemes(blocked, ["forest"]));
});
