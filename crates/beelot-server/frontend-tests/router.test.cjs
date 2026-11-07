const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { routeFor, isKnownRoute, makeNavigate, tabs, tabBarState } = require("../static/router.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("each fixed path opens the view it opened before", () => {
  const expected = {
    "/": "home", "/index.html": "home", "/play/bot": "home", "/play/local": "home",
    "/online/private": "private", "/online/private/new": "private", "/online/public": "public", "/tutorial": "tutorial", "/rules": "rules",
    "/settings": "settings", "/stats": "stats", "/privacy": "privacy"
  };
  for (const [pathname, view] of Object.entries(expected)) assert.equal(routeFor(pathname).view, view, pathname);
});

test("game, bidding and table paths carry their id", () => {
  assert.deepEqual(routeFor("/play/bot/game/abc"), { view: "table", tab: null, sheet: null, phase: null, params: { id: "abc" } });
  assert.deepEqual(routeFor("/play/bot/bidding/abc"), { view: "table", tab: null, sheet: null, phase: "auction", params: { id: "abc" } });
  for (const base of ["/online/private", "/online/public"]) {
    const route = routeFor(`${base}/table/t1`);
    assert.equal(route.view, "table");
    assert.equal(route.phase, "online");
    assert.equal(route.tab, null);
    assert.equal(route.params.id, "t1");
  }
});

test("an unknown path falls back to home, and only the three setup routes open a sheet", () => {
  assert.equal(routeFor("/nope").view, "home");
  assert.equal(routeFor("/nope").sheet, null);
  const setup = { "/play/bot": ["home", "play", "solo"], "/play/local": ["home", "play", "pass"], "/online/private/new": ["private", "crew", "crew"] };
  for (const [pathname, [view, tab, mode]] of Object.entries(setup)) {
    assert.deepEqual(routeFor(pathname), { view, tab, sheet: "setup", phase: null, params: { mode } }, pathname);
    assert.equal(isKnownRoute(pathname), true);
  }
  for (const pathname of ["/", "/stats", "/online/private", "/online/public", "/rules", "/play/bot/game/x", "/online/private/table/t"]) {
    assert.equal(routeFor(pathname).sheet, null, pathname);
  }
});

test("each route belongs to its tab, and a match belongs to none", () => {
  const expected = {
    "/": "play", "/index.html": "play", "/play/bot": "play", "/play/local": "play", "/tutorial": "play", "/rules": "play",
    "/online/private": "crew", "/online/private/new": "crew", "/online/public": "crew", "/stats": "progress", "/settings": "me", "/privacy": "me",
    "/nope": "play",
    "/play/bot/game/x": null, "/play/bot/bidding/x": null, "/online/private/table/t": null, "/online/public/table/t": null
  };
  for (const [pathname, tab] of Object.entries(expected)) assert.equal(routeFor(pathname).tab, tab, pathname);
});

test("the four tabs are Play, Crew, Progress and Me, each opening a route of its own tab", () => {
  assert.deepEqual(tabs.map(({ id, label, href, glyph }) => [id, label, href, glyph]), [
    ["play", "Play", "/", "♠"], ["crew", "Crew", "/online/private", "♥"],
    ["progress", "Progress", "/stats", "♦"], ["me", "Me", "/settings", "♣"]
  ]);
  for (const tab of tabs) {
    assert.equal(isKnownRoute(tab.href), true);
    assert.equal(routeFor(tab.href).tab, tab.id);
  }
});

test("the bar is hidden with no tab and marks the current one otherwise", () => {
  assert.deepEqual(tabBarState(null), { hidden: true, current: null });
  assert.deepEqual(tabBarState("crew"), { hidden: false, current: "crew" });
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
    render: () => calls.push(["render"]),
    beforeNavigate: () => calls.push(["before"])
  });
  return { navigate, calls };
}

test("navigate pushes the entry once and renders once", () => {
  const { navigate, calls } = fakeNavigation();
  assert.equal(navigate("/stats"), true);
  assert.deepEqual(calls, [["before"], ["push", "/stats"], ["render"]]);
});

test("navigate can replace the entry instead", () => {
  const { navigate, calls } = fakeNavigation();
  navigate("/play/bot", { replace: true });
  assert.deepEqual(calls, [["before"], ["replace", "/play/bot"], ["render"]]);
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
  assert.deepEqual(first.calls, [["ask", "/"], ["before"], ["push", "/"], ["render"]]);
  const second = fakeNavigation(true);
  second.navigate("/");
  assert.deepEqual(second.calls, [["before"], ["push", "/"], ["render"]]);
});
