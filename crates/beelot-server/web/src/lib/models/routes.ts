// The routes of the single page and the view each one opens (US-116), and the tab each view belongs to (US-117). `sheet`
// names the sheet a route opens over its page (the setup sheet, US-118; the help sheet, US-123). The addresses are the
// server's SPA_PATHS (app.rs) and must not change: links, bookmarks and the Android app open them.
export type View = "home" | "private" | "public" | "tutorial" | "settings" | "stats" | "leaderboard" | "privacy" | "table";
export type Tab = "play" | "crew" | "progress" | "me";
export type SetupMode = "solo" | "pass" | "crew";

interface FixedRoute {
  view: View;
  sheet?: "setup" | "help";
  mode?: SetupMode;
}

const fixedRoutes: Record<string, FixedRoute> = {
  "/": { view: "home" },
  "/index.html": { view: "home" },
  "/play/bot": { view: "home", sheet: "setup", mode: "solo" },
  "/play/local": { view: "home", sheet: "setup", mode: "pass" },
  "/online/private": { view: "private" },
  "/online/private/new": { view: "private", sheet: "setup", mode: "crew" },
  "/online/public": { view: "public" },
  "/tutorial": { view: "tutorial" },
  "/rules": { view: "home", sheet: "help" },
  "/settings": { view: "settings" },
  "/stats": { view: "stats" },
  "/leaderboard": { view: "leaderboard" },
  "/privacy": { view: "privacy" }
};

export const tabs: { id: Tab; label: string; href: string }[] = [
  { id: "play", label: "Play", href: "/" },
  { id: "crew", label: "Crew", href: "/online/private" },
  { id: "progress", label: "Progress", href: "/stats" },
  { id: "me", label: "Me", href: "/settings" }
];

const tabOfView: Record<View, Tab | null> = {
  home: "play",
  tutorial: "play",
  private: "crew",
  public: "crew",
  stats: "progress",
  leaderboard: "progress",
  settings: "me",
  privacy: "me",
  table: null
};

// Paths that end in an id: the prefix, the view, and the phase of that view (the auction is the card table with its sheet).
const idRoutes: [string, View, "auction" | "online" | null][] = [
  ["/play/bot/game/", "table", null],
  ["/play/bot/bidding/", "table", "auction"],
  ["/online/private/table/", "table", "online"],
  ["/online/public/table/", "table", "online"],
  ["/friends/add/", "private", null],
  ["/join/", "private", null]
];

export interface Route {
  view: View;
  tab: Tab | null;
  sheet: "setup" | "help" | null;
  phase: "auction" | "online" | null;
  params: { id?: string; mode?: SetupMode };
}

export function routeFor(pathname: string): Route {
  for (const [prefix, view, phase] of idRoutes) {
    if (pathname.startsWith(prefix)) return { view, tab: tabOfView[view], sheet: null, phase, params: { id: pathname.slice(prefix.length) } };
  }
  const { view, sheet = null, mode } = fixedRoutes[pathname] ?? { view: "home" as View };
  return { view, tab: tabOfView[view], sheet, phase: null, params: mode ? { mode } : {} };
}

export function isKnownRoute(pathname: string): boolean {
  return pathname in fixedRoutes || idRoutes.some(([prefix]) => pathname.startsWith(prefix));
}
