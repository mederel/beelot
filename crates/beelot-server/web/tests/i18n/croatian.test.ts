// Croatian (US-218): the language is offered, its Bela texts exist and its card and suit names read as a Croatian player says them.
import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { hr } from "$lib/i18n/hr";
import { cardName, LANGUAGES, loadLanguage, setLanguage, suitName, t, translated } from "$lib/i18n/i18n.svelte";
import { fr } from "$lib/i18n/fr";

beforeAll(async () => {
  await loadLanguage("hr");
  await setLanguage("hr");
});

test("Croatian is one of the languages", () => {
  assert.ok(LANGUAGES.includes("hr"));
});

test("every Bela text has a Croatian translation", () => {
  for (const text of [
    "Bela",
    "Name the trump suit or say dalje",
    "The dealer may not say dalje: name the trump suit",
    "Bela variant",
    "Name the trump or say dalje, as in Croatia"
  ]) {
    assert.ok(translated(text, "hr"), text);
  }
  assert.equal(t("Pass"), "Dalje");
});

test("the suits and cards are named as in Croatia", () => {
  assert.equal(suitName("HEARTS"), "Herc");
  assert.equal(suitName("CLUBS", false), "tref");
  assert.equal(cardName({ rank: "K", suit: "HEARTS" }), "Kralj herc");
  assert.equal(cardName({ rank: "10", suit: "SPADES" }), "10 pik");
});

test("Croatian only translates keys that exist in the French dictionary, so a typo cannot hide", () => {
  const fresh = new Set(["Bela", "Name the trump or say dalje, as in Croatia"]);
  const unknown = Object.keys(hr).filter((key) => !Object.hasOwn(fr, key) && !fresh.has(key));
  assert.deepEqual(unknown, []);
});
