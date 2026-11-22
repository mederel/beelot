// The page as the server serves it: the built files obey the content security policy (no inline script or style), the
// sources never write markup or a style attribute, the routes are the server's, the app is installable and works offline,
// and the text keeps its contrast on the night colours.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { isKnownRoute, routeFor } from "$lib/models/routes";
import { shellFiles } from "../build/service-worker";

const staticDir = "../static";
const read = (path: string) => readFileSync(path, "utf8");

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(name) ? [path] : [];
  });
}

test("the built page has no inline script, style element, style attribute or event handler", () => {
  const html = read(join(staticDir, "index.html"));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style\b/);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /\son[a-z]+="/);
  assert.match(html, /<script type="module" crossorigin src="\/app.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" crossorigin href="\/app.css">/);
});

test("the sources never write markup or a style attribute, which the policy would refuse", () => {
  for (const file of files("src", /\.(ts|svelte)$/)) {
    const source = read(file);
    assert.doesNotMatch(source, /\{@html|innerHTML|insertAdjacentHTML|outerHTML/, file);
    assert.doesNotMatch(source, /setAttribute\(\s*["']style["']|\.cssText\b/, file);
    // A static style attribute is parsed with the markup and refused; style: directives go through the CSSOM.
    if (file.endsWith(".svelte")) assert.doesNotMatch(source.replace(/<style>[\s\S]*?<\/style>/g, ""), /\sstyle="/, file);
  }
});

test("the routes are the single-page paths the server answers with index.html", () => {
  const app = read("../src/app.rs");
  const paths = [...app.slice(app.indexOf("const SPA_PATHS")).matchAll(/"(\/[^"]*)"/g)].map((match) => match[1]).slice(0, 16);
  assert.equal(paths.length, 16);
  for (const path of paths) assert.ok(isKnownRoute(path.replace("{id}", "abc").replace("{code}", "abc")), path);
  assert.equal(routeFor("/play/bot/bidding/abc").phase, "auction");
  assert.equal(routeFor("/online/public/table/abc").phase, "online");
  assert.equal(routeFor("/nowhere").view, "home");
});

test("the manifest makes the app installable, with icons that exist", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons.find((item: { sizes: string }) => item.sizes === size);
    assert.ok(icon, size);
    assert.ok(existsSync(join("public", icon.src)), icon.src);
  }
  assert.ok(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable"), "a maskable icon for Android");
  assert.match(read("index.html"), /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(read("src/App.svelte"), /serviceWorker\.register\("\/sw.js"\)/);
});

test("the offline shell keeps every built file but the music, and never the API", () => {
  assert.deepEqual(shellFiles(["app.js", "index.html", "sw.js", "music/comic.ogg", "assets/a.woff2"]), ["/", "/app.js", "/assets/a.woff2"]);
  const worker = read(join(staticDir, "sw.js"));
  const listed = JSON.parse(worker.slice(worker.indexOf("const FILES = ") + 14, worker.indexOf(";\n", worker.indexOf("const FILES = "))));
  assert.ok(listed.includes("/app.js") && listed.includes("/app.css") && listed.includes("/"));
  for (const path of listed.filter((item: string) => item !== "/")) assert.ok(existsSync(join(staticDir, path)), path);
  assert.match(worker, /!url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /const CACHE = "beelot-shell-[0-9a-f]{12}"/);
});

// WCAG relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test("text keeps a contrast of at least 4.5:1 on the night colours and on honey", () => {
  const css = read("src/app.css");
  const token = (name: string) => css.match(new RegExp(`--color-${name}: (#[0-9a-f]{6});`))![1];
  for (const background of ["night-900", "night-800", "night-700"]) {
    for (const text of ["ink", "muted", "faint", "honey-300", "honey-400", "mint-400", "coral-400", "violet-300", "violet-400"]) {
      assert.ok(contrast(token(text), token(background)) >= 4.5, `${text} on ${background}: ${contrast(token(text), token(background)).toFixed(2)}`);
    }
  }
  for (const honey of ["honey-300", "honey-400", "honey-500"]) assert.ok(contrast("#1b1203", token(honey)) >= 4.5, honey);
  assert.ok(contrast(token("card-red"), token("card")) >= 4.5, "red suits on the card");
  assert.ok(contrast(token("card-black"), token("card")) >= 4.5, "black suits on the card");
  assert.ok(contrast("#ffffff", token("violet-600")) >= 4.5, "white on violet");
});
