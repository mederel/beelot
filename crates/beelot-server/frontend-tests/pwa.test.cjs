const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { shellAssets, cacheable } = require("../static/sw.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");

test("the manifest makes the app installable", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons.find((i) => i.sizes === size);
    assert.ok(icon, size);
    assert.ok(fs.existsSync(path.join(__dirname, "../static", icon.src)));
  }
});

test("the page links the manifest and registers the worker", () => {
  const html = read("index.html");
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /id="offline-note"[^>]*hidden/);
  assert.match(read("offline.js"), /serviceWorker.register\("\/sw.js"\)/);
});

test("the shell lists every script and style of the page, and every file exists", () => {
  const html = read("index.html");
  const assets = shellAssets(html);
  for (const script of html.matchAll(/<script src="(\/[^"]+)"/g)) assert.ok(assets.includes(script[1]), script[1]);
  assert.ok(assets.includes("/styles.css") && assets.includes("/"));
  for (const asset of assets.filter((a) => a !== "/")) {
    assert.ok(fs.existsSync(path.join(__dirname, "../static", asset)), asset);
  }
});

test("the API and other origins are never cached", () => {
  const here = "http://localhost";
  assert.equal(cacheable(new URL("/api/me", here), "GET", here), false);
  assert.equal(cacheable(new URL("/app.js", here), "GET", here), true);
  assert.equal(cacheable(new URL("/app.js", here), "POST", here), false);
  assert.equal(cacheable(new URL("https://example.com/x.js"), "GET", here), false);
});
