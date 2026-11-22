// US-176: the modules depend on each other in one direction. Views (pages, shell, ui) use the table's controller, which uses
// the API, the stores (the state) and the models; the models know none of them. No import cycle remains, and a layer never
// imports a layer above it. Only static imports count (a lazy `import()` is not a start-up dependency), and type-only
// imports are erased by the build.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "vitest";

const SRC = resolve(__dirname, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
const all = files(SRC);
const name = (path: string) => relative(SRC, path);

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("$lib/") ? join(SRC, "lib", specifier.slice(5)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (base === null) return null;
  return ["", ".ts", ".svelte", ".svelte.ts", "/index.ts"].map((extension) => base + extension).find((path) => all.includes(path)) ?? null;
}

const IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

const graph = new Map<string, string[]>(
  all.map((file) => {
    const text = readFileSync(file, "utf8");
    const targets = [...text.matchAll(IMPORT)].map((match) => resolveImport(file, match[1] ?? match[2])).filter((target): target is string => target !== null);
    return [file, [...new Set(targets)]];
  })
);

test("the sources have no import cycle", () => {
  assert.ok(all.length > 80, "the scan reads the sources");
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[] = [];
  const visit = (node: string) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next].map(name).join(" -> "));
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const file of all) if (!state.has(file)) visit(file);
  assert.deepEqual(cycles, []);
});

// Pure modules with no import of their own, which any layer may use although they sit in the API folder.
const PURE_LEAVES = ["lib/api/csrf.ts"];

// Each layer, and the folders it may not import from (the ones above it).
const LAYERS: { layer: string; in: RegExp; never: RegExp }[] = [
  {
    layer: "models, i18n, cards and avatars",
    in: /^lib\/(models|i18n|cards|avatars)\//,
    never: /^(lib\/(stores|api|ui|brand|audio|fx)\/|pages\/|shell\/|table\/|App\.svelte|main\.ts)/
  },
  { layer: "the API, the stores, the sound and the effects", in: /^lib\/(api|stores|audio|fx)\//, never: /^(lib\/(ui|brand)\/|pages\/|shell\/|table\/|App\.svelte|main\.ts)/ },
  { layer: "the table's controller", in: /^table\//, never: /^(pages\/|shell\/|App\.svelte|main\.ts)/ }
];

test("a layer never imports one above it", () => {
  const violations: string[] = [];
  for (const [file, targets] of graph) {
    for (const rule of LAYERS) {
      if (!rule.in.test(name(file))) continue;
      for (const target of targets)
        if (rule.never.test(name(target)) && !PURE_LEAVES.includes(name(target))) violations.push(`${rule.layer}: ${name(file)} imports ${name(target)}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("the pure leaves import nothing, and the scan sees the imports it is meant to", () => {
  for (const leaf of PURE_LEAVES) assert.deepEqual(graph.get(join(SRC, leaf)), [], leaf);
  const client = [...graph.keys()].find((file) => name(file) === "lib/api/client.ts") as string;
  assert.ok((graph.get(client) ?? []).map(name).includes("lib/stores/connection.svelte.ts"));
  const game = [...graph.keys()].find((file) => name(file) === "table/game.svelte.ts") as string;
  assert.ok((graph.get(game) ?? []).map(name).includes("lib/api/client.ts"));
});
