const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { routeFor, isKnownRoute, makeNavigate } = require("../static/router.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("each fixed path opens the view it opened before", () => {
  const expected = {
    "/": "home", "/index.html": "home", "/play/bot": "bot", "/play/local": "local",
    "/online/private": "private", "/online/public": "public", "/tutorial": "tutorial", "/rules": "rules",
    "/settings": "settings", "/stats": "stats", "/privacy": "privacy"
  };
  for (const [pathname, view] of Object.entries(expected)) assert.equal(routeFor(pathname).view, view, pathname);
});

test("game, bidding and table paths carry their id", () => {
  assert.deepEqual(routeFor("/play/bot/game/abc"), { view: "bot-game", tab: null, sheet: null, params: { id: "abc" } });
  assert.equal(routeFor("/play/bot/bidding/abc").view, "bidding");
  assert.equal(routeFor("/play/bot/bidding/abc").params.id, "abc");
  for (const base of ["/online/private", "/online/public"]) {
    const route = routeFor(`${base}/table/t1`);
    assert.equal(route.view, "private-table");
    assert.equal(route.params.id, "t1");
  }
});

test("an unknown path falls back to home and tab and sheet stay empty for now", () => {
  assert.equal(routeFor("/nope").view, "home");
  for (const pathname of ["/", "/stats", "/play/bot/game/x", "/nope"]) {
    assert.equal(routeFor(pathname).tab, null);
    assert.equal(routeFor(pathname).sheet, null);
  }
});

test("only real routes are known", () => {
  assert.equal(isKnownRoute("/nope"), false);
  assert.equal(isKnownRoute("/stats"), true);
  assert.equal(isKnownRoute("/play/bot/game/abc"), true);
});

test("the script loads before app.js", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("/router.js") > 0 && html.indexOf("/router.js") < html.indexOf("/app.js"));
});

function fakeNavigation(leave = false) {
  const calls = [];
  const navigate = makeNavigate({
    history: {
      pushState: (_state, _title, url) => calls.push(["push", url]),
      replaceState: (_state, _title, url) => calls.push(["replace", url])
    },
    askToLeave: (url) => { calls.push(["ask", url]); return leave; },
    render: () => calls.push(["render"])
  });
  return { navigate, calls };
}

test("navigate pushes the entry once and renders once", () => {
  const { navigate, calls } = fakeNavigation();
  assert.equal(navigate("/stats"), true);
  assert.deepEqual(calls, [["push", "/stats"], ["render"]]);
});

test("navigate can replace the entry instead", () => {
  const { navigate, calls } = fakeNavigation();
  navigate("/play/bot", { replace: true });
  assert.deepEqual(calls, [["replace", "/play/bot"], ["render"]]);
});

test("a path that is not a route is left to the browser", () => {
  const { navigate, calls } = fakeNavigation();
  assert.equal(navigate("/nope"), false);
  assert.deepEqual(calls, []);
});

test("a confirmed leave waits for the answer and does not move", () => {
  const { navigate, calls } = fakeNavigation(true);
  assert.equal(navigate("/", { confirmLeave: true }), true);
  assert.deepEqual(calls, [["ask", "/"]]);
});

test("a leave that needs no answer goes ahead, and a plain navigation never asks", () => {
  const first = fakeNavigation(false);
  first.navigate("/", { confirmLeave: true });
  assert.deepEqual(first.calls, [["ask", "/"], ["push", "/"], ["render"]]);
  const second = fakeNavigation(true);
  second.navigate("/");
  assert.deepEqual(second.calls, [["push", "/"], ["render"]]);
});
