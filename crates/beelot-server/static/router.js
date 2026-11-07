// The routes of the single page and the view each one opens (US-116), and the tab each view belongs to (US-117).
// `sheet` names the sheet a route opens over its page (the setup sheet, US-118).
const fixedRoutes = {
  "/": { view: "home" },
  "/index.html": { view: "home" },
  // The setup sheet (US-118) opens over its tab's page; the mode says which seats it asks for.
  "/play/bot": { view: "home", sheet: "setup", mode: "solo" },
  "/play/local": { view: "home", sheet: "setup", mode: "pass" },
  "/online/private": { view: "private" },
  "/online/private/new": { view: "private", sheet: "setup", mode: "crew" },
  "/online/public": { view: "public" },
  "/tutorial": { view: "tutorial" },
  // The rules are a sheet over home (US-123); from a table the same sheet opens without leaving the match.
  "/rules": { view: "home", sheet: "help" },
  "/settings": { view: "settings" },
  "/stats": { view: "stats" },
  "/privacy": { view: "privacy" }
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
  home: "play", tutorial: "play", rules: "play",
  private: "crew", public: "crew",
  stats: "progress",
  settings: "me", privacy: "me",
  "bot-game": null, table: null, bidding: null, "private-table": null
};

// Paths that end in an id: the prefix, the view, the phase of that view (the auction is the card table with its sheet,
// US-120) and the id that follows the prefix.
const idRoutes = [
  ["/play/bot/game/", "table"],
  ["/play/bot/bidding/", "table", "auction"],
  ["/online/private/table/", "table", "online"],
  ["/online/public/table/", "table", "online"]
];

function routeFor(pathname) {
  for (const [prefix, view, phase = null] of idRoutes) {
    if (pathname.startsWith(prefix)) return { view, tab: tabOfView[view], sheet: null, phase, params: { id: pathname.slice(prefix.length) } };
  }
  const { view, sheet = null, mode } = fixedRoutes[pathname] ?? { view: "home" };
  return { view, tab: tabOfView[view], sheet, phase: null, params: mode ? { mode } : {} };
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
