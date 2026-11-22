// The stores that hold the page's small shared state: the router, the notices, the sheets and the connection.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { connection, showConnectionTrouble } from "$lib/stores/connection.svelte";
import { notices } from "$lib/stores/notices.svelte";
import { navigate, onBeforeNavigate, onPopState, route, router, setLeaveGuard, startRouter } from "$lib/stores/router.svelte";
import { help, openHelp } from "$lib/stores/sheets.svelte";

beforeEach(() => {
  history.replaceState({}, "", "/");
  router.path = "/";
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

afterEach(() => setLeaveGuard(null));

test("navigate moves to a known route, pushes the history entry and scrolls to the top on a new view", () => {
  assert.equal(navigate("/online/private"), true);
  assert.equal(router.path, "/online/private");
  assert.equal(location.pathname, "/online/private");
  assert.equal(route().view, "private");
  assert.equal(vi.mocked(window.scrollTo).mock.calls.length, 1);
});

test("navigate refuses a path that is not a route and leaves the address alone", () => {
  assert.equal(navigate("/no/such/page"), false);
  assert.equal(router.path, "/");
  assert.equal(location.pathname, "/");
});

test("replace swaps the history entry instead of adding one", () => {
  const before = history.length;
  navigate("/online/private", { replace: true });
  assert.equal(history.length, before);
  assert.equal(location.pathname, "/online/private");
});

test("the table's leave guard can keep the player where they are", () => {
  const guard = vi.fn(() => true);
  setLeaveGuard(guard);
  assert.equal(navigate("/online/private", { confirmLeave: true }), true);
  assert.deepEqual(guard.mock.calls, [["/online/private"]]);
  assert.equal(router.path, "/");
  // Without confirmLeave the guard is not asked.
  navigate("/online/private");
  assert.equal(guard.mock.calls.length, 1);
  assert.equal(router.path, "/online/private");
});

test("a guard that lets the player go does not stop the move", () => {
  setLeaveGuard(() => false);
  navigate("/online/private", { confirmLeave: true });
  assert.equal(router.path, "/online/private");
});

test("open sheets are told before the address changes, until they unsubscribe", () => {
  const seen: string[] = [];
  const stop = onBeforeNavigate(() => seen.push(router.path));
  navigate("/online/private");
  assert.deepEqual(seen, ["/"]);
  stop();
  navigate("/");
  assert.deepEqual(seen, ["/"]);
});

test("a click on a same-site link to a route navigates without a page load", () => {
  startRouter();
  const link = document.createElement("a");
  link.href = "/online/private";
  document.body.append(link);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(router.path, "/online/private");
  link.remove();
});

test("modified clicks, new-tab links, downloads and unknown paths are left to the browser", () => {
  startRouter();
  const make = (attributes: Record<string, string>) => {
    const link = document.createElement("a");
    link.href = "/online/private";
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    document.body.append(link);
    return link;
  };
  const pressed = (link: HTMLElement, init: MouseEventInit = {}) => {
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    link.dispatchEvent(click);
    return click;
  };
  const checks: [HTMLElement, MouseEventInit?][] = [
    [make({}), { ctrlKey: true }],
    [make({}), { metaKey: true }],
    [make({}), { shiftKey: true }],
    [make({}), { button: 1 }],
    [make({ target: "_blank" })],
    [make({ download: "" })]
  ];
  for (const [link, init] of checks) {
    assert.equal(pressed(link, init).defaultPrevented, false);
    link.remove();
  }
  const unknown = make({});
  unknown.setAttribute("href", "/not-a-route");
  assert.equal(pressed(unknown).defaultPrevented, false);
  unknown.remove();
  assert.equal(router.path, "/");
});

test("a popstate goes to a sheet's handler first, and to the page's route when none takes it", () => {
  startRouter();
  const stop = onPopState((state) => state?.sheet === true);
  history.replaceState({}, "", "/online/private");
  window.dispatchEvent(new PopStateEvent("popstate", { state: { sheet: true } }));
  assert.equal(router.path, "/", "the sheet took the event");
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  assert.equal(router.path, "/online/private");
  stop();
});

test("a notice is for one page and is read once", () => {
  notices.set("/online/private", "That table is no longer available.");
  assert.equal(notices.take("/public"), "");
  assert.equal(notices.take("/online/private"), "That table is no longer available.");
  assert.equal(notices.take("/online/private"), "");
});

test("the help sheet opens with the table's hint and close handler, not routed", () => {
  const hint = () => {};
  const onClose = () => {};
  help.routed = true;
  openHelp({ hint, onClose });
  assert.equal(help.open, true);
  assert.equal(help.routed, false);
  assert.equal(help.hint, hint);
  assert.equal(help.onClose, onClose);
  openHelp();
  assert.equal(help.hint, null);
  assert.equal(help.onClose, null);
});

test("the connection follows the browser going offline and online, and the trouble note", () => {
  window.dispatchEvent(new Event("offline"));
  assert.equal(connection.offline, true);
  window.dispatchEvent(new Event("online"));
  assert.equal(connection.offline, false);
  showConnectionTrouble(true);
  assert.equal(connection.trouble, true);
  showConnectionTrouble(false);
  assert.equal(connection.trouble, false);
});
