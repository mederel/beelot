// The browser tests answer the page's API calls from the page's side (web/e2e/mock.ts, page.route). A service worker's own
// requests bypass page.route, so with the page's service worker running, a second navigation in WebKit reached the real server
// (a 401) instead of the recorded snapshot. The config must keep service workers blocked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const config = fs.readFileSync(path.join(__dirname, "../web/playwright.config.ts"), "utf8");

test("the browser tests block service workers so that page.route sees every API call", () => {
  assert.match(config, /serviceWorkers:\s*"block"/);
});
