// The routes of the single page and the view each one opens (US-116). `tab` and `sheet` stay empty until the tab bar
// and the routed sheets arrive; a route table entry will name them so that no handler has to change.
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

// Paths that end in an id: the prefix, the view and the id that follows it.
const idRoutes = [
  ["/play/bot/game/", "bot-game"],
  ["/play/bot/bidding/", "bidding"],
  ["/online/private/table/", "private-table"],
  ["/online/public/table/", "private-table"]
];

function routeFor(pathname) {
  for (const [prefix, view] of idRoutes) {
    if (pathname.startsWith(prefix)) return { view, tab: null, sheet: null, params: { id: pathname.slice(prefix.length) } };
  }
  return { view: fixedRoutes[pathname] ?? "home", tab: null, sheet: null, params: {} };
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

if (typeof module !== "undefined") module.exports = { routeFor, isKnownRoute, makeNavigate };
