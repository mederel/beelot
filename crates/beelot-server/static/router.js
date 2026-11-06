// The routes of the single page and the view each one opens (US-116), and the tab each view belongs to (US-117).
// `sheet` stays empty until the routed sheets arrive; a route table entry will name it so that no handler has to change.
const fixedRoutes = {
  "/": "home",
  "/index.html": "home",
  "/play/bot": "bot",
  "/play/local": "local",
  "/online/private": "private",
  "/online/public": "public",
  "/tutorial": "tutorial",
  "/rules": "rules",
  "/settings": "settings",
  "/stats": "stats",
  "/privacy": "privacy"
};

// The tab bar (US-117): the glyph is its icon, the href is where the tab leads. Crew leads to private tables; finding a
// game stays under Crew but is reached from the Play tab until the two share one screen.
const tabs = [
  { id: "play", label: "Play", href: "/", glyph: "♠" },
  { id: "crew", label: "Crew", href: "/online/private", glyph: "♥" },
  { id: "progress", label: "Progress", href: "/stats", glyph: "♦" },
  { id: "me", label: "Me", href: "/settings", glyph: "♣" }
];

// The tab of each view; a match has none, and the bar is hidden there.
const tabOfView = {
  home: "play", bot: "play", local: "play", tutorial: "play", rules: "play",
  private: "crew", public: "crew",
  stats: "progress",
  settings: "me", privacy: "me",
  "bot-game": null, bidding: null, "private-table": null
};

// Paths that end in an id: the prefix, the view and the id that follows it.
const idRoutes = [
  ["/play/bot/game/", "bot-game"],
  ["/play/bot/bidding/", "bidding"],
  ["/online/private/table/", "private-table"],
  ["/online/public/table/", "private-table"]
];

function routeFor(pathname) {
  for (const [prefix, view] of idRoutes) {
    if (pathname.startsWith(prefix)) return { view, tab: tabOfView[view], sheet: null, params: { id: pathname.slice(prefix.length) } };
  }
  const view = fixedRoutes[pathname] ?? "home";
  return { view, tab: tabOfView[view], sheet: null, params: {} };
}

// What the bar shows for a route's tab: nothing during a match, otherwise the current tab marked.
function tabBarState(tab) {
  return tab === null ? { hidden: true, current: null } : { hidden: false, current: tab };
}

function isKnownRoute(pathname) {
  return pathname in fixedRoutes || idRoutes.some(([prefix]) => pathname.startsWith(prefix));
}

// The one place that moves to another route: `history` is the History API, `askToLeave(path)` opens the leave sheet
// and answers true when it did (US-110), `beforeNavigate` runs just before the entry changes (open sheets end there),
// `render` draws the view of the new address. A path that is not a route is left to the browser, and the answer says
// whether the navigation was handled.
function makeNavigate({ history, askToLeave, render, beforeNavigate = () => {} }) {
  return function navigate(path, { replace = false, confirmLeave = false } = {}) {
    if (!isKnownRoute(path)) return false;
    if (confirmLeave && askToLeave(path)) return true;
    beforeNavigate();
    if (replace) history.replaceState({}, "", path);
    else history.pushState({}, "", path);
    render();
    return true;
  };
}

if (typeof module !== "undefined") module.exports = { routeFor, isKnownRoute, makeNavigate, tabs, tabBarState };
