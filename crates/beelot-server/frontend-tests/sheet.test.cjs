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
  const history = { pushed: [], pushState(state) { history.pushed.push(state); }, back() {}, state: null };
  const document = {
    activeElement: null,
    querySelector: (selector) => (selector === "main" ? main : null),
    contains: (el) => inDocument.has(el)
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

test("the script loads before app.js", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("/sheet.js") > 0 && html.indexOf("/sheet.js") < html.indexOf("/app.js"));
});
