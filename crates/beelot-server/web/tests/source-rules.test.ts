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

// US-206: the page follows what a phone's browser does to it. A full-height layout uses the dynamic viewport units, which follow
// the browser's bars, and not `vh`, which is the height with the bars hidden (a bottom control then sits under them); the page
// declares `viewport-fit=cover` so that the safe-area insets exist; and a player can always pinch to zoom.
const WEB = join(__dirname, "..");
const styled = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? styled(path) : /\.(ts|svelte|css|html)$/.test(name) ? [path] : [];
  });

/** `vh` in a length: `100vh`, `9vh`, but not `dvh`, `svh` or `lvh`, nor a word that ends in "vh". */
const STATIC_VH = /(?<![\w.-])\d*\.?\d+vh\b/;

test("no layout uses the vh unit: dvh and svh follow the browser's bars", () => {
  const files = [...styled(SRC), join(WEB, "index.html")];
  assert.ok(files.length > 50, "the scan reads the sources");
  for (const file of files) {
    const text = withoutComments(readFileSync(file, "utf8"));
    assert.doesNotMatch(text, STATIC_VH, `${relative(WEB, file)} uses vh: use dvh (or svh for a height that must not change with the bars)`);
  }
});

test("the rule against vh catches what it is meant to", () => {
  for (const code of ["height: 100vh;", "min-height:100vh", "clamp(3.2rem, 9vh, 4.6rem)", "calc(100vh - 2rem)", "max-height: 87.5vh"]) {
    assert.match(code, STATIC_VH, code);
  }
  for (const code of ["height: 100dvh;", "max-height: min(92dvh, 100%)", "100svh", "100lvh", "clamp(1rem, 2dvh, 2rem)", "const vh = 3", "--vh: 1"]) {
    assert.doesNotMatch(code, STATIC_VH, code);
  }
});

test("the page declares viewport-fit=cover and never forbids zoom", () => {
  for (const file of [join(WEB, "index.html"), join(WEB, "../static/index.html")]) {
    const html = readFileSync(file, "utf8");
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1];
    assert.ok(viewport, `${relative(WEB, file)} has a viewport meta`);
    assert.match(viewport, /viewport-fit=cover/, `${relative(WEB, file)} declares viewport-fit=cover`);
    assert.doesNotMatch(viewport, /user-scalable\s*=\s*(no|0)|maximum-scale\s*=/i, `${relative(WEB, file)} lets the player zoom`);
  }
});

test("the rule against disabled zoom catches what it is meant to", () => {
  const forbids = (content: string) => /user-scalable\s*=\s*(no|0)|maximum-scale\s*=/i.test(content);
  for (const content of ["width=device-width, user-scalable=no", "width=device-width,maximum-scale=1", "width=device-width, user-scalable=0"]) assert.ok(forbids(content), content);
  assert.ok(!forbids("width=device-width, initial-scale=1, viewport-fit=cover"));
});

// US-207: the page never locks the orientation (the manifest says "any" and no source calls the lock), and the transitions that
// travel come from `$lib/ui/motion`, which follows the effects level, and not straight from Svelte.
const LOCKS_ORIENTATION = /\borientation\s*\.\s*lock\s*\(/;

test("the orientation is never locked", () => {
  for (const file of [join(WEB, "public/manifest.webmanifest"), join(WEB, "../static/manifest.webmanifest")]) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as { orientation?: string };
    assert.ok(manifest.orientation === undefined || manifest.orientation === "any", `${relative(WEB, file)} says orientation "${manifest.orientation}"`);
  }
  for (const file of styled(SRC)) {
    assert.doesNotMatch(withoutComments(readFileSync(file, "utf8")), LOCKS_ORIENTATION, `${relative(WEB, file)} locks the orientation`);
  }
});

test("the rule against an orientation lock catches what it is meant to", () => {
  for (const code of ["screen.orientation.lock('portrait')", "await screen.orientation .lock ( 'landscape' )"]) assert.match(code, LOCKS_ORIENTATION, code);
  for (const code of ["screen.orientation.type", "const unlock = screen.orientation.unlock()", "const clock = 1"]) assert.doesNotMatch(code, LOCKS_ORIENTATION, code);
});

/** A transition that moves things, imported from Svelte itself. */
const TRAVELLING_IMPORT = /import\s*\{[^}]*\b(fly|scale|slide|crossfade)\b[^}]*\}\s*from\s*["']svelte\/transition["']/;

test("fly, scale and slide come from $lib/ui/motion, which drops the travel when the player or the system asks for less motion", () => {
  for (const file of styled(SRC)) {
    if (file.endsWith("lib/ui/motion.ts")) continue;
    assert.doesNotMatch(readFileSync(file, "utf8"), TRAVELLING_IMPORT, `${relative(WEB, file)} imports a moving transition from svelte/transition: import it from $lib/ui/motion`);
  }
});

test("the rule against a moving transition from Svelte catches what it is meant to", () => {
  for (const code of ['import { fly } from "svelte/transition";', 'import { fade, scale } from "svelte/transition"', "import {slide} from 'svelte/transition'"])
    assert.match(code, TRAVELLING_IMPORT, code);
  for (const code of ['import { fade } from "svelte/transition";', 'import { fly } from "$lib/ui/motion";']) assert.doesNotMatch(code, TRAVELLING_IMPORT, code);
});
