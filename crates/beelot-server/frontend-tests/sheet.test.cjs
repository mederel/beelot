const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { dragOutcome, makeSheets } = require("../static/sheet.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

// A dialog with the parts of <dialog> the component uses. Like the browser, close() fires "close" later, not at once.
function fakeDialog() {
  const listeners = {};
  const dialog = {
    open: false,
    attributes: {},
    id: `sheet-${Math.random().toString(36).slice(2)}`,
    showCalls: 0,
    pendingClose: false,
    showModal() { dialog.open = true; dialog.showCalls += 1; },
    close() { if (dialog.open) { dialog.open = false; dialog.pendingClose = true; } },
    setAttribute(name, value) { dialog.attributes[name] = value; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    fire(type, event = {}) {
      const e = { defaultPrevented: false, target: dialog, preventDefault() { e.defaultPrevented = true; }, ...event };
      (listeners[type] ?? []).forEach((fn) => fn(e));
      return e;
    },
    // What the browser does after close(): the close event arrives.
    flushClose() { if (dialog.pendingClose) { dialog.pendingClose = false; dialog.fire("close"); } }
  };
  return dialog;
}

function fakePage() {
  const focused = [];
  const element = (name) => ({ name, focus() { focused.push(name); } });
  const main = element("main");
  const inDocument = new Set();
  // A stack of entries: back() pops at once, and the test plays the popstate the browser would send.
  const history = {
    entries: [null], backs: 0,
    pushState(state) { history.entries.push(state); },
    replaceState(state) { history.entries[history.entries.length - 1] = state; },
    back() { history.backs += 1; history.entries.pop(); },
    get state() { return history.entries.at(-1); }
  };
  const document = {
    activeElement: null,
    body: element("body"),
    querySelector: (selector) => (selector === "main" ? main : null),
    contains: (el) => el === document.body || inDocument.has(el)
  };
  const opener = (name) => { const el = element(name); inDocument.add(el); return el; };
  return { document, history, focused, opener, remove: (el) => inDocument.delete(el) };
}

test("a drag past 30% of the height or faster than 0.5 px/ms closes the sheet", () => {
  assert.equal(dragOutcome({ distance: 31, height: 100, speed: 0 }), "close");
  assert.equal(dragOutcome({ distance: 29, height: 100, speed: 0 }), "back");
  assert.equal(dragOutcome({ distance: 1, height: 100, speed: 0.6 }), "close");
  assert.equal(dragOutcome({ distance: 1, height: 100, speed: 0.4 }), "back");
});

test("opening shows the dialog as a modal and marks it aria-modal", () => {
  const page = fakePage();
  const dialog = fakeDialog();
  makeSheets(page).openSheet(dialog, { routed: false });
  assert.equal(dialog.open, true);
  assert.equal(dialog.attributes["aria-modal"], "true");
});

test("closing returns the focus to the opener, or to main when the opener is gone", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const opener = page.opener("leave-link");
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { opener, routed: false });
  sheets.closeSheet(dialog);
  assert.deepEqual(page.focused, ["leave-link"]);
  sheets.openSheet(dialog, { opener, routed: false });
  page.remove(opener);
  sheets.closeSheet(dialog);
  assert.deepEqual(page.focused, ["leave-link", "main"]);
});

test("onClose runs once per close, even when the close event arrives afterwards", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  let closed = 0;
  sheets.openSheet(dialog, { routed: false, onClose: () => { closed += 1; } });
  sheets.closeSheet(dialog);
  dialog.flushClose();
  assert.equal(closed, 1);
  assert.equal(sheets.isOpen(dialog), false);
});

test("a dismissible sheet closes on Escape and on a click on its backdrop", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const escape = fakeDialog();
  sheets.openSheet(escape, { routed: false });
  escape.close();
  escape.flushClose();
  assert.equal(sheets.isOpen(escape), false);
  const backdrop = fakeDialog();
  sheets.openSheet(backdrop, { routed: false });
  backdrop.fire("click", { target: backdrop });
  assert.equal(backdrop.open, false);
});

test("a click inside the sheet does not close it", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { routed: false });
  dialog.fire("click", { target: { name: "button" } });
  assert.equal(dialog.open, true);
});

test("a sheet that cannot be dismissed ignores Escape and the backdrop", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { routed: false, dismissible: false });
  assert.equal(dialog.fire("cancel").defaultPrevented, true);
  dialog.fire("click", { target: dialog });
  assert.equal(dialog.open, true);
});

test("a second Escape that closes it anyway reopens it", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { routed: false, dismissible: false });
  dialog.close();
  dialog.flushClose();
  assert.equal(dialog.open, true);
  assert.equal(sheets.isOpen(dialog), true);
});

test("opening a second sheet closes the first without moving the focus", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const first = fakeDialog();
  const second = fakeDialog();
  sheets.openSheet(first, { opener: page.opener("first-opener"), routed: false });
  sheets.openSheet(second, { routed: false });
  assert.equal(first.open, false);
  assert.equal(second.open, true);
  assert.deepEqual(page.focused, []);
});

test("opening a routed sheet adds one history entry", () => {
  const page = fakePage();
  const dialog = fakeDialog();
  makeSheets(page).openSheet(dialog);
  assert.equal(page.history.entries.length, 2);
  assert.deepEqual(page.history.state, { sheet: dialog.id });
});

test("the back button closes the open sheet and the page is not rendered again", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog);
  page.history.entries.pop();
  assert.equal(sheets.handlePopState({}), true);
  assert.equal(dialog.open, false);
  assert.equal(sheets.isOpen(dialog), false);
  assert.equal(page.history.backs, 0);
});

test("a popstate with no sheet open is left to the router", () => {
  assert.equal(makeSheets(fakePage()).handlePopState({}), false);
});

test("closing a sheet takes its entry off once, and that popstate is not a navigation", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog);
  sheets.closeSheet(dialog);
  assert.equal(page.history.backs, 1);
  assert.equal(page.history.entries.length, 1);
  assert.equal(sheets.handlePopState({}), true);
  assert.equal(sheets.handlePopState({}), false);
});

test("a second sheet takes the place of the first: one dialog open, one entry", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const first = fakeDialog();
  const second = fakeDialog();
  sheets.openSheet(first);
  sheets.openSheet(second);
  assert.equal(first.open, false);
  assert.equal(second.open, true);
  assert.equal(page.history.entries.length, 2);
  assert.deepEqual(page.history.state, { sheet: second.id });
  assert.equal(page.history.backs, 0);
});

test("the back button does not dismiss a sheet that cannot be dismissed", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { dismissible: false });
  page.history.entries.pop();
  assert.equal(sheets.handlePopState({}), true);
  assert.equal(dialog.open, true);
  assert.equal(page.history.entries.length, 2);
});

test("a sheet that is not routed never touches the history", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { routed: false });
  sheets.closeSheet(dialog);
  assert.equal(page.history.entries.length, 1);
  assert.equal(page.history.backs, 0);
  assert.equal(sheets.handlePopState({}), false);
});

test("the pass-and-play cover is a sheet that cannot be dismissed", () => {
  const html = read("index.html");
  assert.match(html, /<dialog class="handoff" data-sheet id="handoff" aria-labelledby="handoff-title">/);
  assert.doesNotMatch(html, /<div class="handoff"/);
  const app = read("app.js");
  const handOff = app.slice(app.indexOf("function handOff("), app.indexOf('document.querySelector("#handoff-ready").addEventListener'));
  assert.match(handOff, /sheets\.openSheet\(cover, \{ dismissible: false \}\)/);
  assert.doesNotMatch(handOff, /routed: false/);
  assert.match(handOff, /sheets\.closeSheet\(cover\)/);
  assert.doesNotMatch(handOff, /cover\.hidden/);
  assert.match(read("styles.css"), /dialog\.handoff\[data-sheet\]/);
});

test("opening the sheet that is already open adds no second history entry", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { dismissible: false });
  sheets.openSheet(dialog, { dismissible: false });
  assert.equal(page.history.entries.length, 2);
  assert.equal(dialog.showCalls, 1);
  sheets.closeSheet(dialog);
  assert.equal(page.history.entries.length, 1);
});

test("a body that had the focus counts as no opener: the focus goes to main", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  sheets.openSheet(dialog, { opener: page.document.body, routed: false });
  sheets.closeSheet(dialog);
  assert.deepEqual(page.focused, ["main"]);
});

test("closeAll ends every sheet without touching the history", () => {
  const page = fakePage();
  const sheets = makeSheets(page);
  const dialog = fakeDialog();
  let closed = 0;
  sheets.openSheet(dialog, { dismissible: false, onClose: () => { closed += 1; } });
  sheets.closeAll();
  assert.equal(dialog.open, false);
  assert.equal(sheets.isOpen(dialog), false);
  assert.equal(page.history.backs, 0);
  assert.equal(closed, 1);
  assert.equal(sheets.handlePopState({}), false);
});

test("a sheet says why it closed: the player closed it, or the app ended it", () => {
  const reasons = [];
  const onClose = (reason) => reasons.push(reason);
  const page = fakePage();
  const sheets = makeSheets(page);
  const open = (options = {}) => { const d = fakeDialog(); sheets.openSheet(d, { routed: false, onClose, ...options }); return d; };

  sheets.closeSheet(open());
  const escape = open(); escape.close(); escape.flushClose();
  const backdrop = open(); backdrop.fire("click", { target: backdrop });
  assert.deepEqual(reasons, ["closed", "closed", "closed"]);

  reasons.length = 0;
  open(); sheets.closeAll();
  open(); open();
  assert.deepEqual(reasons, ["ended", "ended"]);

  sheets.closeAll();
  reasons.length = 0;
  const routed = fakeDialog();
  sheets.openSheet(routed, { onClose });
  page.history.entries.pop();
  sheets.handlePopState({});
  assert.deepEqual(reasons, ["ended"]);
});

test("the script loads before app.js", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("/sheet.js") > 0 && html.indexOf("/sheet.js") < html.indexOf("/app.js"));
});
