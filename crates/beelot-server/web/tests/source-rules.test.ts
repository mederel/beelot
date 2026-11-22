// US-195: the page never turns text into markup or code. A script injected into the page would find the player tokens in the
// storage; the content security policy refuses inline script, and these rules keep the sinks that would feed it out of the
// sources, in the `.ts` and in the `.svelte` files (Biome's rule `lint/no-html-sinks.grit` checks the `.ts`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const SRC = join(__dirname, "../src");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SINKS: [string, RegExp][] = [
  ["innerHTML", /\.innerHTML\b/],
  ["outerHTML", /\.outerHTML\b/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["document.write", /\bdocument\s*\.\s*write(ln)?\s*\(/],
  ["eval", /(?<![.\w])eval\s*\(/],
  ["new Function", /\bnew\s+Function\b|(?<![.\w])Function\s*\(/],
  ["{@html}", /\{@html\b/],
  ["a string given to setTimeout or setInterval", /\bset(Timeout|Interval)\s*\(\s*["'`]/],
  ["createContextualFragment", /\bcreateContextualFragment\b/],
  ["srcdoc", /\bsrcdoc\b/]
];

test("the frontend's sources use none of the sinks that turn text into markup or code", () => {
  const files = sources(SRC);
  assert.ok(files.length > 50, "the scan reads the sources");
  for (const file of files) {
    const text = withoutComments(readFileSync(file, "utf8"));
    for (const [name, pattern] of SINKS) assert.doesNotMatch(text, pattern, `${relative(SRC, file)} uses ${name}`);
  }
});

test("the rules catch what they are meant to", () => {
  const caught = (code: string) => SINKS.some(([, pattern]) => pattern.test(code));
  for (const code of [
    "el.innerHTML = x",
    "el.outerHTML",
    "el.insertAdjacentHTML('beforeend', x)",
    "document.write(x)",
    "eval(x)",
    "new Function('return 1')",
    "{@html text}",
    "setTimeout('run()', 1)"
  ]) {
    assert.ok(caught(code), code);
  }
  for (const code of ["el.textContent = x", "el.append(x)", "window.setTimeout(fn, 1)", "const evaluate = 1", "retrieval(x)", "Math.max(1)"]) {
    assert.ok(!caught(code), code);
  }
});

test("Biome's rule names the same sinks, so that the lint and this test agree", () => {
  const rule = readFileSync(join(__dirname, "../../lint/no-html-sinks.grit"), "utf8");
  for (const word of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval", "new Function"]) assert.ok(rule.includes(word), word);
  assert.match(readFileSync(join(__dirname, "../../biome.json"), "utf8"), /no-html-sinks\.grit/);
});
