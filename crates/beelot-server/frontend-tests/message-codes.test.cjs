// The texts the server sends as codes (US-170). The server lists every code it can send, with samples of the
// parameters, in fixtures/message-catalogue.json (its test keeps the file up to date). fixtures/message-texts-today.json
// records what the page showed for each English sentence before the codes, in English, French and Dutch.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { source } = require("./source.cjs");

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
const catalogue = fixture("message-catalogue.json");
const today = fixture("message-texts-today.json");
const LANGUAGES = ["en", "fr", "nl"];
// Texts the page writes itself with the same machinery: not sent by the server, so not in its catalogue.
const PAGE_CODES = ["cards-count"];

async function load(language) {
  globalThis.window = { localStorage: { getItem: () => language } };
  const url = pathToFileURL(path.join(__dirname, "../static/i18n.js")).href;
  return import(`${url}?${language}`);
}

async function texts() {
  return (await import(pathToFileURL(path.join(__dirname, "../static/i18n-messages.js")).href)).messageTexts;
}

test("every text the server can send reads as it did before the codes, in English, French and Dutch", async () => {
  const { renderMessage } = await load("en");
  assert.ok(catalogue.length > 100, "the catalogue lists the messages");
  for (const entry of catalogue) {
    const before = today[entry.english];
    assert.ok(before, `the recording of today has no text for "${entry.english}"`);
    for (const language of LANGUAGES) {
      assert.equal(renderMessage(entry.code, entry.params, language), before[language], `${entry.code} ${JSON.stringify(entry.params)} in ${language}`);
    }
  }
});

test("a code without a text in a language fails", async () => {
  const messageTexts = await texts();
  const codes = new Set([...catalogue.map((entry) => entry.code), ...PAGE_CODES]);
  for (const language of LANGUAGES) {
    for (const code of codes) assert.ok(code in messageTexts[language], `${language} has no text for ${code}`);
    for (const code of Object.keys(messageTexts[language])) assert.ok(codes.has(code), `${language} has a text for ${code}, which the server never sends`);
  }
});

test("the English sentence of a code is the one the server sends", async () => {
  const { renderMessage } = await load("en");
  for (const entry of catalogue) assert.equal(renderMessage(entry.code, entry.params, "en"), entry.english, entry.code);
});

test("the page writes the number of cards of a seat with a code", async () => {
  const { renderMessage } = await load("en");
  for (const count of [0, 1, 5, 8]) {
    for (const language of LANGUAGES) {
      assert.equal(renderMessage("cards-count", { count }, language), today[`${count} cards`][language], `${count} in ${language}`);
    }
  }
});

test("the player's own seat gets the verb forms of its own", async () => {
  const { renderMessage } = await load("en");
  const bid = { name: "You", value: "90", trump: "HEARTS" };
  assert.equal(renderMessage("auction-bid", bid, "fr"), "Vous annoncez 90 cœur.");
  assert.equal(renderMessage("auction-bid", { ...bid, name: "Léa" }, "fr"), "Léa annonce 90 cœur.");
  assert.equal(renderMessage("auction-bid", bid, "nl"), "Jij biedt 90 harten.");
  assert.equal(renderMessage("auction-deciding", { name: "Léa" }, "nl"), "Léa denkt na.");
});

test("a code the page does not know shows the English sentence the server sent with it", async () => {
  const { localized, renderMessage } = await load("fr");
  assert.equal(renderMessage("no-such-code", {}, "fr"), null);
  assert.equal(localized({ code: "no-such-code", params: {} }, "A new sentence."), "A new sentence.");
  assert.equal(localized({ code: "seat-taken", params: {} }, "That seat is taken."), "Cette place est déjà prise.");
  assert.equal(localized(undefined, ""), "");
});

test("the page shows a text in its own language", async () => {
  for (const [language, expected] of [["en", "That seat is taken."], ["fr", "Cette place est déjà prise."], ["nl", "Deze plaats is al bezet."]]) {
    const { localized } = await load(language);
    assert.equal(localized({ code: "seat-taken", params: {} }, "That seat is taken."), expected);
  }
});

test("no sentence of the server is matched by a pattern any more", () => {
  const i18n = source("i18n.js", "i18n-nl.js");
  assert.doesNotMatch(i18n, /translateServer|serverPatterns|frenchPatterns|patterns:/);
  // The dictionaries keyed by the English sentence keep none of the sentences that have a code.
  for (const entry of catalogue.filter((item) => !Object.keys(item.params).length)) {
    if (["Pass", "Coinche!", "Enter a player name.", "Player names are limited to 30 characters.", "The auction has not finished.", "Something went wrong. Please try again."].includes(entry.english)) continue;
    assert.ok(!i18n.includes(`${JSON.stringify(entry.english)}:`), `"${entry.english}" is still a key of a dictionary`);
  }
});

test("the page reads the codes of a response, not its English", () => {
  const session = source("app-session.js");
  assert.match(session, /body\.code \? localized\(body, body\.message\)/);
  assert.doesNotMatch(source("app-auction.js", "app-core.js", "app-solo-table.js", "app-celebrations.js"), /\bt\(`\$\{/);
});
