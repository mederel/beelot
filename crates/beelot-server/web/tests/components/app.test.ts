// The whole page, mounted at each address with a guest and no server: every screen renders without an error in the three
// languages, sets the document title, and the dock's links lead to routes.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const guest = (url: string) => {
  if (url.startsWith("/api/account") || url.startsWith("/api/me") || url.startsWith("/api/session")) return new Response("{}", { status: 401 });
  return new Response("{}", { status: 404 });
};

let app: Record<string, unknown> | null = null;
let unmountApp: (app: Record<string, unknown>) => void = () => {};
let errors: unknown[][] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => guest(String(url))));
  window.scrollTo = vi.fn() as never;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
  vi.resetModules();
});

afterEach(() => {
  if (app) unmountApp(app);
  app = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function show(path: string, language: "en" | "fr" | "nl") {
  localStorage.setItem("beelot.language", language);
  history.replaceState({}, "", path);
  const i18n = await import("$lib/i18n/i18n.svelte");
  await i18n.loadLanguage(language);
  const router = await import("$lib/stores/router.svelte");
  router.router.path = path;
  // Svelte is loaded again with the app, so that the page and its runtime are the same instance.
  const { flushSync, mount, unmount } = await import("svelte");
  unmountApp = unmount as never;
  const { default: App } = await import("../../src/App.svelte");
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(App, { target });
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 20));
  flushSync();
  return target;
}

const SCREENS: [string, string][] = [
  ["/", "home"],
  ["/play/bot", "the solo setup sheet"],
  ["/play/local", "the pass-and-play setup sheet"],
  ["/online/private", "the crew page"],
  ["/online/private/new", "the private table setup sheet"],
  ["/online/public", "the public page"],
  ["/tutorial", "the tutorial"],
  ["/rules", "the rules sheet"],
  ["/stats", "the statistics"],
  ["/leaderboard", "the leaderboard"],
  ["/settings", "the settings"],
  ["/privacy", "the privacy policy"]
];

for (const language of ["en", "fr", "nl"] as const) {
  for (const [path, name] of SCREENS) {
    test(`${name} (${path}) renders in ${language} without an error`, async () => {
      const target = await show(path, language);
      assert.ok(target.textContent!.trim().length > 20, "something is shown");
      assert.ok(document.title.length > 0 && !document.title.startsWith(" — "), `the title is set: ${document.title}`);
      assert.deepEqual(errors, []);
    });
  }
}

test("the home page offers the ways to play, and a link to each goes to a route", async () => {
  const target = await show("/", "en");
  const hrefs = [...target.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
  for (const expected of ["/play/local", "/online/private", "/online/public", "/tutorial", "/rules", "/privacy"]) assert.ok(hrefs.includes(expected), `a link to ${expected}`);
  const play = [...target.querySelectorAll("button")].find((button) => button.textContent?.includes("Play now"));
  assert.ok(play, "a Play now button");
  play!.click();
  const { router } = await import("$lib/stores/router.svelte");
  assert.equal(router.path, "/play/bot");
  const { isKnownRoute } = await import("$lib/models/routes");
  for (const href of hrefs.filter((href) => href!.startsWith("/") && !href!.startsWith("//"))) {
    if (/^\/(api|music|\.well-known)/.test(href!)) continue;
    assert.ok(isKnownRoute(href!), `${href} is a route`);
  }
});

test("the navigation marks the page the player is on", async () => {
  const target = await show("/settings", "en");
  const current = target.querySelectorAll('[aria-current="page"]');
  assert.ok(current.length >= 1);
  assert.ok([...current].every((element) => element.getAttribute("href") === "/settings"));
});

test("the setup sheet is a dialog that opens over the home page", async () => {
  const target = await show("/play/bot", "en");
  const dialog = target.querySelector("dialog");
  assert.ok(dialog, "a dialog");
  assert.ok(dialog!.querySelector("form, [role=radiogroup]"), "the form of the setup");
});
