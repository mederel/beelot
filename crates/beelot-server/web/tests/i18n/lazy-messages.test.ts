// US-192: the French and Dutch texts of the server's codes travel with their language, not with the main bundle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "vitest";
import { loadLanguage, renderMessage } from "$lib/i18n/i18n.svelte";

const staticFile = (name: string) => readFileSync(resolve(process.cwd(), "../static", name), "utf8");

describe("lazy message texts", () => {
  test("a language has no text for a code until it is loaded, and loading one leaves the other alone", async () => {
    assert.equal(renderMessage("table-closed", {}, "fr"), null);
    assert.equal(renderMessage("table-closed", {}, "nl"), null);
    assert.equal(renderMessage("table-closed", {}, "en"), "This table does not exist.");
    await loadLanguage("fr");
    assert.equal(renderMessage("table-closed", {}, "fr"), "Cette table n'existe pas.");
    assert.equal(renderMessage("table-closed", {}, "nl"), null);
    await loadLanguage("nl");
    assert.equal(renderMessage("table-closed", {}, "nl"), "Deze tafel bestaat niet.");
  });

  test("the built page's main script holds none of the French or Dutch texts of the codes", () => {
    const index = staticFile("index.html");
    const main = /src="\/(assets\/app-[\w-]+\.js)"/.exec(index)?.[1];
    assert.ok(main, "index.html names the main script");
    const script = staticFile(main);
    assert.ok(script.includes("This table does not exist."), "the main script holds the English texts");
    assert.ok(!script.includes("Cette table n'existe pas."), "no French text in the main script");
    assert.ok(!script.includes("Deze tafel bestaat niet."), "no Dutch text in the main script");
  });
});
