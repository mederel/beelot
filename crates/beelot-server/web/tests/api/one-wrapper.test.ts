// US-193: every request of the page goes through the wrapper of `$lib/api/client`. The page's sources are read as text: a
// `fetch(` anywhere else, or a second reader of the CSRF cookie, fails here. The service worker (build/sw-template.js) is
// outside src/ and has its own tests.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const SRC = join(__dirname, "../../src");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
const where = (pattern: RegExp) =>
  sources(SRC)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(SRC, path))
    .sort();

test("only the wrapper calls fetch, and the telemetry wraps the browser's own", () => {
  assert.deepEqual(where(/(?<![.\w])fetch\(/), ["lib/api/client.ts"]);
  assert.deepEqual(where(/\b(win|window|globalThis)\.fetch\b/), ["lib/models/telemetry.ts"]);
});

test("only one function reads the CSRF cookie", () => {
  assert.deepEqual(where(/XSRF-TOKEN=/), ["lib/api/csrf.ts"]);
  assert.deepEqual(where(/\.cookie\b/), ["lib/api/client.ts", "lib/models/telemetry.ts"]);
});
