const test = require("node:test");
const assert = require("node:assert/strict");

// A minimal stand-in for the DOM: the overlay's elements by id, plus `main` and the document's key listeners.
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.textContent = "";
    this.hidden = true;
    this.inert = false;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.focused = 0;
    this.style = { properties: {}, setProperty(name, value) { this.properties[name] = value; } };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { this.focused += 1; document.activeElement = this; }
  texts() { return this.children.map((child) => child.textContent); }
}

const ids = ["match-end", "match-end-title", "match-end-options", "match-end-rematch", "match-end-sticker", "match-end-confetti", "match-end-podium",
  "match-end-recap", "match-end-play-again", "match-end-view-table"];
const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new FakeElement(id.endsWith("again") || id.endsWith("table") ? "button" : "div")]));
const main = new FakeElement("main");
const listeners = [];
const opener = new FakeElement("button");
globalThis.document = {
  activeElement: opener,
  createElement: (tag) => new FakeElement(tag),
  querySelector: (selector) => (selector === "main" ? main : elements[selector] ?? null),
  addEventListener: (type, handler) => listeners.push({ type, handler }),
  removeEventListener: (type, handler) => {
    const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
    if (index >= 0) listeners.splice(index, 1);
  },
};
globalThis.window = {};
globalThis.t = (text, ...args) => text.replace(/\{(\d)\}/g, (_, index) => args[index]);
globalThis.formatNumber = (value) => String(value);

const { showMatchEnd, hideMatchEnd } = require("../static/match-end.js");

const model = (overrides = {}) => ({
  winner: "East–West",
  iWon: true,
  podium: [
    { place: 1, team: "East–West", names: ["Camille", "Manon"], score: 1040 },
    { place: 2, team: "North–South", names: ["You", "Luc"], score: 760 },
  ],
  recap: {
    rounds: 7,
    biggestRound: { round: 4, team: "East–West", points: 182 },
    announcements: [
      { team: "North–South", items: [{ kind: "tierce", count: 1 }, { kind: "carre", count: 1 }] },
      { team: "East–West", items: [] },
    ],
  },
  ...overrides,
});

const reset = () => {
  hideMatchEnd();
  document.activeElement = opener;
  for (const element of Object.values(elements)) element.focused = 0;
};

test("opening shows the overlay, names the winner, locks the table and focuses Play again", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  assert.equal(elements["#match-end"].hidden, false);
  assert.equal(elements["#match-end-title"].textContent, "East–West win the match!");
  assert.equal(main.inert, true);
  assert.equal(elements["#match-end-play-again"].focused, 1);
  hideMatchEnd();
});

test("the podium has the two steps in place order with names and scores", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  const steps = elements["#match-end-podium"].children;
  assert.deepEqual(steps.map((step) => step.dataset.place), ["1", "2"]);
  assert.deepEqual(steps[0].texts(), ["Camille · Manon", "1040"]);
  assert.deepEqual(steps[1].texts(), ["You · Luc", "760"]);
  hideMatchEnd();
});

test("the recap lists rounds, the biggest round and the announcements of each team", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  assert.deepEqual(elements["#match-end-recap"].texts(), [
    "7 rounds",
    "Biggest round: 182 points, East–West, round 4",
    "Announcements",
    "North–South: tierce ×1, carré ×1",
    "East–West: None",
  ]);
  hideMatchEnd();
});

test("a match with no biggest round leaves that line out", () => {
  reset();
  const noBiggest = model();
  noBiggest.recap.biggestRound = null;
  showMatchEnd(noBiggest, { animate: true });
  assert.ok(!elements["#match-end-recap"].texts().some((line) => line.startsWith("Biggest round")));
  hideMatchEnd();
});

test("the sticker and 14 confetti pieces only appear for the winner while animating", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  assert.equal(elements["#match-end-sticker"].textContent, "Victory!");
  assert.equal(elements["#match-end-sticker"].hidden, false);
  assert.equal(elements["#match-end-confetti"].children.length, 14);
  hideMatchEnd();

  showMatchEnd(model({ iWon: false }), { animate: true });
  assert.equal(elements["#match-end-sticker"].hidden, true);
  assert.equal(elements["#match-end-confetti"].children.length, 0);
  hideMatchEnd();

  showMatchEnd(model(), { animate: false });
  assert.equal(elements["#match-end-sticker"].hidden, true);
  assert.equal(elements["#match-end-confetti"].children.length, 0);
  hideMatchEnd();
});

test("Play again calls playAgain once", () => {
  reset();
  let calls = 0;
  showMatchEnd(model(), { animate: true, playAgain: () => { calls += 1; } });
  elements["#match-end-play-again"].onclick();
  assert.equal(calls, 1);
  hideMatchEnd();
});

test("View table and Escape each dismiss once and close the overlay", () => {
  reset();
  let dismissed = 0;
  showMatchEnd(model(), { animate: true, onDismiss: () => { dismissed += 1; } });
  elements["#match-end-view-table"].onclick();
  assert.equal(dismissed, 1);
  assert.equal(elements["#match-end"].hidden, true);

  showMatchEnd(model(), { animate: true, onDismiss: () => { dismissed += 1; } });
  listeners.find((entry) => entry.type === "keydown").handler({ key: "Escape" });
  assert.equal(dismissed, 2);
  assert.equal(elements["#match-end"].hidden, true);
});

test("other keys do not close it", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  listeners.find((entry) => entry.type === "keydown").handler({ key: "a" });
  assert.equal(elements["#match-end"].hidden, false);
  hideMatchEnd();
});

test("hiding directly does not dismiss", () => {
  reset();
  let dismissed = 0;
  showMatchEnd(model(), { animate: true, onDismiss: () => { dismissed += 1; } });
  hideMatchEnd();
  assert.equal(dismissed, 0);
});

test("closing unlocks the table, empties the confetti, restores focus and drops the key listener", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  hideMatchEnd();
  assert.equal(main.inert, false);
  assert.equal(elements["#match-end-confetti"].children.length, 0);
  assert.equal(document.activeElement, opener);
  assert.equal(listeners.filter((entry) => entry.type === "keydown").length, 0);
});

test("opening twice leaves one key listener and one set of content", () => {
  reset();
  showMatchEnd(model(), { animate: true });
  showMatchEnd(model(), { animate: true });
  assert.equal(listeners.filter((entry) => entry.type === "keydown").length, 1);
  assert.equal(elements["#match-end-podium"].children.length, 2);
  assert.equal(elements["#match-end-confetti"].children.length, 14);
  hideMatchEnd();
  assert.equal(document.activeElement, opener, "focus returns to what opened it first, not to the overlay");
});

test("hiding before any open does not throw", () => {
  reset();
  assert.doesNotThrow(() => hideMatchEnd());
});
