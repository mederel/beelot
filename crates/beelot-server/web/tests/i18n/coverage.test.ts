// Every text of the page is translated into French and Dutch: the literals given to t() in the components and the
// texts of the tables that the components translate (themes, moments, hints, reactions, the auction's reasons, …).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { bg } from "$lib/i18n/bg";
import { hy } from "$lib/i18n/hy";
import { fr } from "$lib/i18n/fr";
import { nl } from "$lib/i18n/nl";
import { REASONS } from "$lib/models/auction-sheet";
import { BOT_LINES } from "$lib/models/bot-lines";
import { LESSONS, WHY, WHY_NOT } from "$lib/models/coach";
import { MOMENTS } from "$lib/models/moments";
import { LOCKED_THEMES, THEME_NAMES } from "$lib/models/prefs";
import { submitLabel } from "$lib/models/setup-form";
import { HINT_REASONS, REACTIONS } from "../../src/table/game.svelte";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : files(path);
    return /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
}

// The string literals inside the parentheses of each t(…) call: t("Text"), t(cond ? "A" : "B").
function translatedLiterals(source: string): string[] {
  const found: string[] = [];
  const pattern = /\bt\(/g;
  for (const match of source.matchAll(pattern)) {
    let depth = 1;
    let index = match.index! + 2;
    const start = index;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '"') {
        const end = source.indexOf('"', index + 1);
        found.push(source.slice(index + 1, end));
        index = end + 1;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      index += 1;
    }
    void start;
  }
  return found.filter((text) => /^[A-Z{+]/.test(text) && !/^[A-Z_]+$/.test(text));
}

const missing = (text: string) =>
  [!Object.hasOwn(fr, text) && "fr", !Object.hasOwn(nl, text) && "nl", !Object.hasOwn(bg, text) && "bg", !Object.hasOwn(hy, text) && "hy"].filter(Boolean);

test("every literal given to t() has a French and a Dutch text", () => {
  const problems: string[] = [];
  for (const file of files("src")) {
    for (const text of translatedLiterals(readFileSync(file, "utf8"))) {
      const languages = missing(text);
      if (languages.length) problems.push(`${file}: "${text}" (${languages.join(", ")})`);
    }
  }
  assert.deepEqual(problems, []);
});

test("the texts of the tables the page translates have a French and a Dutch text", () => {
  const texts = [
    ...Object.values(THEME_NAMES),
    ...Object.values(LOCKED_THEMES).map((theme) => theme.hint),
    ...Object.values(MOMENTS).map((moment) => moment.text),
    ...Object.values(HINT_REASONS),
    ...Object.values(WHY),
    ...Object.values(WHY_NOT),
    ...LESSONS.flatMap((lesson) => [lesson.title, lesson.goal]),
    ...Object.values(REACTIONS).map(([, label]) => label),
    ...Object.values(REASONS),
    ...Object.values(BOT_LINES).flatMap((kinds) => Object.values(kinds).flat()),
    ...(["solo", "pass", "crew"] as const).map(submitLabel)
  ];
  const problems = texts.filter((text) => missing(text).length).map((text) => `"${text}" (${missing(text).join(", ")})`);
  assert.deepEqual(problems, []);
});
