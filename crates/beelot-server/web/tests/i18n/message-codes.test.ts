// The texts the server sends as codes (US-170). The server lists every code it can send, with samples of the parameters, in
// frontend-tests/fixtures/message-catalogue.json (crates/beelot-server/tests/message_codes.rs keeps it up to date), and
// message-texts-today.json records what the page showed for each English sentence before the codes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "vitest";
import { fr } from "$lib/i18n/fr";
import { localized, renderMessage, setLanguage } from "$lib/i18n/i18n.svelte";
import { messageTexts } from "$lib/i18n/messages";
import { nl } from "$lib/i18n/nl";
import type { Language } from "$lib/i18n/types";

const fixture = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), "../frontend-tests/fixtures", name), "utf8"));
const catalogue: { code: string; params: Record<string, string>; english: string }[] = fixture("message-catalogue.json");
const today: Record<string, Record<Language, string>> = fixture("message-texts-today.json");
const LANGUAGES: Language[] = ["en", "fr", "nl"];
// Texts the page writes itself with the same machinery: not sent by the server, so not in its catalogue.
const PAGE_CODES = ["cards-count"];

describe("message codes", () => {
  test("every text the server can send reads as it did before the codes, in English, French and Dutch", () => {
    assert.ok(catalogue.length > 100, "the catalogue lists the messages");
    for (const entry of catalogue) {
      const before = today[entry.english];
      assert.ok(before, `the recording of today has no text for "${entry.english}"`);
      for (const language of LANGUAGES) {
        assert.equal(renderMessage(entry.code, entry.params, language), before[language], `${entry.code} ${JSON.stringify(entry.params)} in ${language}`);
      }
    }
  });

  test("a code without a text in a language fails", () => {
    const codes = new Set([...catalogue.map((entry) => entry.code), ...PAGE_CODES]);
    for (const language of LANGUAGES) {
      for (const code of codes) assert.ok(code in messageTexts[language], `${language} has no text for ${code}`);
      for (const code of Object.keys(messageTexts[language])) assert.ok(codes.has(code), `${language} has a text for ${code}, which the server never sends`);
    }
  });

  test("the English sentence of a code is the one the server sends", () => {
    for (const entry of catalogue) assert.equal(renderMessage(entry.code, entry.params, "en"), entry.english, entry.code);
  });

  test("the page writes the number of cards of a seat with a code", () => {
    for (const count of [0, 1, 5, 8]) {
      for (const language of LANGUAGES) assert.equal(renderMessage("cards-count", { count }, language), today[`${count} cards`][language], `${count} in ${language}`);
    }
  });

  test("the player's own seat gets the verb forms of its own", () => {
    const bid = { name: "You", value: "90", trump: "HEARTS" };
    assert.equal(renderMessage("auction-bid", bid, "fr"), "Vous annoncez 90 cœur.");
    assert.equal(renderMessage("auction-bid", { ...bid, name: "Léa" }, "fr"), "Léa annonce 90 cœur.");
    assert.equal(renderMessage("auction-bid", bid, "nl"), "Jij biedt 90 harten.");
    assert.equal(renderMessage("auction-deciding", { name: "Léa" }, "nl"), "Léa denkt na.");
  });

  test("a code the page does not know shows the English sentence the server sent with it", async () => {
    await setLanguage("fr");
    assert.equal(renderMessage("no-such-code", {}, "fr"), null);
    assert.equal(localized({ code: "no-such-code", params: {} }, "A new sentence."), "A new sentence.");
    assert.equal(localized({ code: "seat-taken", params: {} }, "That seat is taken."), "Cette place est déjà prise.");
    assert.equal(localized(undefined, ""), "");
  });

  test("the page shows a text in its own language", async () => {
    for (const [language, expected] of [["en", "That seat is taken."], ["fr", "Cette place est déjà prise."], ["nl", "Deze plaats is al bezet."]] as const) {
      await setLanguage(language);
      assert.equal(localized({ code: "seat-taken", params: {} }, "That seat is taken."), expected);
    }
    await setLanguage("fr");
  });

  test("the dictionaries keyed by the English sentence keep none of the sentences that have a code", () => {
    const allowed = ["Pass", "Coinche!", "Enter a player name.", "Player names are limited to 30 characters.", "The auction has not finished.", "Something went wrong. Please try again."];
    for (const entry of catalogue.filter((item) => !Object.keys(item.params).length)) {
      if (allowed.includes(entry.english)) continue;
      assert.ok(!Object.hasOwn(fr, entry.english) && !Object.hasOwn(nl, entry.english), `"${entry.english}" is still a key of a dictionary`);
    }
  });
});
