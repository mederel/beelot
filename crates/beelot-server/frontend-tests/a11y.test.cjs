const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");

test("the page has a skip link and a polite live region for the game", () => {
  const html = read("index.html");
  assert.match(html, /id="skip-link"/);
  assert.match(html, /id="game-live" role="status" aria-live="polite"/);
  assert.ok(html.indexOf("/game-events.js") < html.indexOf("/app-announce.js"));
  assert.ok(html.indexOf("/app-announce.js") < html.indexOf('/app.js"'));
});

test("every control shows a visible focus", () => {
  const css = read("styles.css");
  assert.match(css, /:focus-visible\s*\{\s*outline: 3px solid/);
  assert.match(css, /\.playing-card:focus-visible/);
});

test("both tables announce what happens", () => {
  assert.match(read("app-solo-table.js"), /announceGame\(gameId, playView\(board, match\)\)/);
  assert.match(read("app-table-ui.js"), /announceGame\(gameId, auctionView\(bidding\)\)/);
});
