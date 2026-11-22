// The one place that moves between pages (US-116). The addresses are those of routes.ts; a path that is not a route is
// left to the browser. Leaving a table in the middle of a match asks first (US-110): the table sets the guard. Sheets that
// hold a history entry close on Back before the page changes. At full effects, pages cross-fade with the View
// Transitions API where the browser has it.
import { flushSync } from "svelte";
import { isKnownRoute, routeFor, type Route } from "$lib/models/routes";
import { settings } from "./settings.svelte";

export const router = $state({ path: typeof location !== "undefined" ? location.pathname : "/" });

export function route(): Route {
  return routeFor(router.path);
}

// The table's question before leaving: answers true when it opened the leave dialog.
let leaveGuard: ((destination: string) => boolean) | null = null;
export function setLeaveGuard(guard: ((destination: string) => boolean) | null): void {
  leaveGuard = guard;
}

// The open sheets close before an address changes; each registers how.
const beforeNavigate = new Set<() => void>();
export function onBeforeNavigate(callback: () => void): () => void {
  beforeNavigate.add(callback);
  return () => beforeNavigate.delete(callback);
}

// A sheet that took a history entry (so that Back closes it) handles the popstate first.
const popHandlers = new Set<(state: any) => boolean>();
export function onPopState(handler: (state: any) => boolean): () => void {
  popHandlers.add(handler);
  return () => popHandlers.delete(handler);
}

function show(path: string): void {
  const before = routeFor(router.path).view;
  const after = routeFor(path).view;
  const update = () => {
    router.path = path;
  };
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  if (before !== after && settings.effects === "full" && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
  if (before !== after) window.scrollTo({ top: 0 });
}

export function navigate(path: string, { replace = false, confirmLeave = false } = {}): boolean {
  if (!isKnownRoute(path)) return false;
  if (confirmLeave && leaveGuard?.(path)) return true;
  beforeNavigate.forEach((callback) => callback());
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  show(path);
  return true;
}

export function startRouter(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.target === "_blank" || link.hasAttribute("download") || link.origin !== location.origin) return;
    const destination = new URL(link.href).pathname;
    if (!isKnownRoute(destination)) return;
    event.preventDefault();
    navigate(destination, { confirmLeave: link.dataset.confirmLeave !== undefined });
  });
  window.addEventListener("popstate", (event) => {
    for (const handler of popHandlers) if (handler(event.state)) return;
    show(location.pathname);
  });
}
