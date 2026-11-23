// US-194: what Beelot keeps in the browser lives in one module. Its keys are the `beelot.*` names, its reads and writes
// survive a disabled or full storage, no other file touches `localStorage` or `sessionStorage`, and the privacy policy
// names the keys the module has.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, test, vi } from "vitest";
import { SETUP_MODES } from "$lib/models/setup-form";
import { KEYS, LOCAL_KEYS, SESSION_KEYS, local, readJson, session, setupKey, writeJson } from "$lib/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const SRC = join(__dirname, "../../src");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const where = (pattern: RegExp) =>
  sources(SRC)
    .filter((path) => pattern.test(withoutComments(readFileSync(path, "utf8"))))
    .map((path) => relative(SRC, path))
    .sort();

test("every key is a unique beelot.* name, and the names players already have are unchanged", () => {
  const all = [...Object.values(KEYS), ...Object.values(SESSION_KEYS)];
  assert.equal(new Set(all).size, all.length);
  for (const key of all) assert.match(key, /^beelot\.[a-z-]+$/);
  // What was stored before this module existed is read as before: the names are part of the players' data.
  assert.deepEqual(
    Object.values(KEYS).sort(),
    [
      "beelot.account-offer",
      "beelot.bot-comments",
      "beelot.bot-game",
      "beelot.effects",
      "beelot.goals",
      "beelot.language",
      "beelot.music-enabled",
      "beelot.music-volume",
      "beelot.pace",
      "beelot.reactions-enabled",
      "beelot.reduced-motion",
      "beelot.resume",
      "beelot.resume-online",
      "beelot.sound-enabled",
      "beelot.theme",
      "beelot.tutorial-lessons",
      "beelot.tutorial-seen",
      "beelot.unlocked-themes",
      "beelot.vibration"
    ].sort()
  );
  assert.deepEqual(Object.values(SESSION_KEYS).sort(), ["beelot.greeted", "beelot.private-table-session", "beelot.table-tokens"]);
  assert.equal(setupKey("solo"), "beelot.setup.solo");
});

test("the stores read and write the browser's storage", () => {
  local.setItem(KEYS.theme, "midnight");
  assert.equal(localStorage.getItem("beelot.theme"), "midnight");
  assert.equal(local.getItem(KEYS.theme), "midnight");
  local.removeItem(KEYS.theme);
  assert.equal(local.getItem(KEYS.theme), null);
  session.setItem(SESSION_KEYS.greeted, "[]");
  assert.equal(sessionStorage.getItem("beelot.greeted"), "[]");
});

const refusing = (name: string) => {
  const refuse = () => {
    throw new DOMException(name, "SecurityError");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
};

test("a disabled storage reads as empty and ignores writes, without throwing", () => {
  vi.stubGlobal("localStorage", refusing("denied"));
  vi.stubGlobal("sessionStorage", refusing("denied"));
  assert.equal(local.getItem(KEYS.theme), null);
  assert.doesNotThrow(() => local.setItem(KEYS.theme, "x"));
  assert.doesNotThrow(() => local.removeItem(KEYS.theme));
  assert.equal(session.getItem(SESSION_KEYS.tableTokens), null);
  assert.equal(readJson(local, KEYS.goals, 7), 7);
  assert.equal(writeJson(local, KEYS.goals, { a: 1 }), false);
});

test("a full storage refuses the write and says so, and still reads what it holds", () => {
  const held = new Map<string, string>([[KEYS.theme, "midnight"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
    removeItem: (key: string) => held.delete(key)
  });
  assert.equal(writeJson(local, KEYS.goals, { a: 1 }), false);
  assert.doesNotThrow(() => local.setItem(KEYS.theme, "x"));
  assert.equal(local.getItem(KEYS.theme), "midnight");
});

test("a missing window.localStorage (no storage at all) behaves as an empty one", () => {
  vi.stubGlobal("localStorage", undefined);
  assert.equal(local.getItem(KEYS.theme), null);
  assert.doesNotThrow(() => local.setItem(KEYS.theme, "x"));
});

test("readJson gives the fallback for a missing, corrupt or refused value, writeJson round-trips", () => {
  assert.deepEqual(readJson(local, KEYS.goals, { empty: true }), { empty: true });
  localStorage.setItem(KEYS.goals, "{nope");
  assert.deepEqual(readJson(local, KEYS.goals, { empty: true }), { empty: true });
  assert.equal(writeJson(local, KEYS.goals, { won: 2 }), true);
  assert.deepEqual(readJson(local, KEYS.goals, null), { won: 2 });
  localStorage.setItem(KEYS.goals, "[1,2]");
  assert.deepEqual(
    readJson(local, KEYS.goals, [], (value): value is number[] => Array.isArray(value)),
    [1, 2]
  );
  assert.deepEqual(
    readJson(local, KEYS.goals, "none", (value): value is string => typeof value === "string"),
    "none"
  );
});

test("only the storage module touches localStorage and sessionStorage, and only it spells a beelot.* key", () => {
  assert.deepEqual(where(/\b(localStorage|sessionStorage)\b/), ["lib/storage.ts"]);
  assert.deepEqual(where(/["'`]beelot\.[a-z]/), ["lib/storage.ts"]);
});

test("the privacy policy names every key the device keeps, in the three languages, and no other", () => {
  const policy = JSON.parse(readFileSync(join(__dirname, "../../public/privacy-policy.json"), "utf8"));
  const section = policy.sections.find((candidate: { id: string }) => candidate.id === "storage");
  const keys = [...LOCAL_KEYS, ...SETUP_MODES.map(setupKey), ...Object.values(SESSION_KEYS)];
  assert.ok(keys.length > 20);
  for (const language of ["en", "fr", "nl"]) {
    const text: string = section.paragraphs.map((paragraph: Record<string, string>) => paragraph[language]).join(" ");
    for (const key of keys) assert.ok(text.includes(key), `${language}: the policy names ${key}`);
    const named = text.match(/beelot\.[a-z-]+(?:\.[a-z]+)?/g) ?? [];
    for (const key of named) assert.ok(keys.includes(key), `${language}: ${key} is a key of the module`);
  }
});
