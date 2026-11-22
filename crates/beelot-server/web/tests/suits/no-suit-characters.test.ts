// No suit character in the sources: every suit is drawn (Suit.svelte), never typed. U+2660..U+2667 are the card suits (black
// and white), U+FE0F the variation selector that turns them into emoji, and the playing-card block U+1F0A0..U+1F0FF the
// other ones a font could substitute. Tests may name them (they check for them); src/ may not.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const FORBIDDEN = /[\u2660-\u2667]|\uFE0F|[\u{1F0A0}-\u{1F0FF}]/u;
const ESCAPED = /&(spades|clubs|hearts|diams)(suit)?;|&#(x266[0-7]|982[4-9]|983[0-1]);|\\u266[0-7]|\\u\{266[0-7]\}/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.test\.(ts|js)$/.test(path) ? [] : [path];
  });
}

test("no suit character or suit emoji appears anywhere in src/, the i18n texts included", () => {
  const offenders = sources("src").flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .flatMap((line, index) => (FORBIDDEN.test(line) ? [`${path}:${index + 1}: ${line.trim().slice(0, 80)}`] : []))
  );
  assert.deepEqual(offenders, []);
});

test("no suit is written as an HTML entity or an escape either", () => {
  assert.deepEqual(
    sources("src").filter((path) => ESCAPED.test(readFileSync(path, "utf8"))),
    []
  );
});
