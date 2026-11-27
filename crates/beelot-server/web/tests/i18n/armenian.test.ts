// Armenian (US-216): the language is offered, its Bazar Blot texts exist, its card and suit names read as an Armenian player
// says them, and every letter it writes is drawn by a font the site serves itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeAll, test } from "vitest";
import { hy, hyMessages } from "$lib/i18n/hy";
import { cardName, LANGUAGES, loadLanguage, setLanguage, suitName, t, translated } from "$lib/i18n/i18n.svelte";
import { fr } from "$lib/i18n/fr";

beforeAll(async () => {
  await loadLanguage("hy");
  await setLanguage("hy");
});

test("Armenian is one of the languages", () => {
  assert.ok(LANGUAGES.includes("hy"));
});

test("every Bazar Blot text has an Armenian translation", () => {
  for (const text of ["Bazar Blot", "Bazar Blot variant", "Kaput", "Contra", "Recontra", "Armenian rules: bid tens of points, contra and kaput"]) {
    assert.ok(translated(text, "hy"), text);
  }
  assert.equal(t("Contra"), "Կոնտրա");
});

test("the suits and cards are named in Armenian", () => {
  assert.equal(suitName("HEARTS"), "Սիրտ");
  assert.equal(suitName("CLUBS", false), "խաչ");
  assert.equal(cardName({ rank: "A", suit: "SPADES" }), "Տուզ պիկ");
  assert.equal(cardName({ rank: "10", suit: "DIAMONDS" }), "10 ղառ");
});

test("Armenian only translates keys that exist in the French dictionary, so a typo cannot hide", () => {
  assert.deepEqual(
    Object.keys(hy).filter((key) => !Object.hasOwn(fr, key)),
    []
  );
});

// The ranges of every @font-face of the site: a letter outside them would be drawn by whatever font the device has.
function declaredRanges(): Array<[number, number]> {
  const css = readFileSync("src/app.css", "utf8");
  const ranges: Array<[number, number]> = [];
  for (const [, list] of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const part of list.split(",")) {
      const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
      ranges.push([Number.parseInt(from, 16), Number.parseInt(to ?? from, 16)]);
    }
  }
  return ranges;
}

test("every character of the Armenian texts is in a font the site serves", () => {
  const ranges = declaredRanges();
  const texts = [...Object.values(hy), ...Object.values(hyMessages).filter((text) => typeof text === "string"), readFileSync("src/lib/i18n/hy.ts", "utf8")];
  const missing = new Set<string>();
  for (const text of texts) {
    for (const character of text as string) {
      const code = character.codePointAt(0) ?? 0;
      // Symbols such as ⚡ and ✓ are the English texts' own, drawn by the device's symbol font in every language.
      if (code < 0x20 || /\p{S}/u.test(character)) continue;
      if (!ranges.some(([from, to]) => code >= from && code <= to)) missing.add(`U+${code.toString(16).toUpperCase().padStart(4, "0")} ${character}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("the Armenian font is served by the site, from no other origin", () => {
  const css = readFileSync("src/app.css", "utf8");
  const face = css.slice(css.indexOf('font-family: "Noto Sans Armenian"'));
  assert.match(face, /url\("@fontsource-variable\/noto-sans-armenian\/files\/[^"]+\.woff2"\)/);
  assert.doesNotMatch(css, /url\("?https?:/);
});
