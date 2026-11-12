const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { shellAssets, cacheable, networkFirst, CACHE } = require("../static/sw.js");

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

// A fake Cache Storage and network, to see what the worker answers.
function fakeWorld(network) {
  const kept = new Map();
  const asked = [];
  globalThis.caches = { open: async () => ({ match: async (k) => kept.get(String(k.url ?? k)), put: async (k, r) => void kept.set(String(k.url ?? k), r) }) };
  globalThis.fetch = async (request, options) => {
    asked.push({ url: String(request.url ?? request), options });
    return network();
  };
  return { kept, asked };
}
const okResponse = (body) => ({ ok: true, body, clone() { return this; } });

test("a new version is answered from the network, not from an older copy", async () => {
  const world = fakeWorld(() => okResponse("new"));
  world.kept.set("/app.js", okResponse("old"));
  const response = await networkFirst("/app.js");
  assert.equal(response.body, "new");
  assert.equal(world.asked[0].options.cache, "no-cache");
  assert.equal(world.kept.get("/app.js").body, "new");
});

test("offline, the copy kept is used", async () => {
  const world = fakeWorld(() => { throw new Error("offline"); });
  world.kept.set("/app.js", okResponse("kept"));
  assert.equal((await networkFirst("/app.js")).body, "kept");
});

test("the cache name changes with this fix so older copies are dropped", () => {
  assert.notEqual(CACHE, "beelot-shell-v1");
});
