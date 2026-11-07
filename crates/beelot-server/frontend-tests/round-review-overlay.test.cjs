const test = require("node:test");
const assert = require("node:assert/strict");

// A minimal stand-in for the DOM: the overlay's elements by id, `main`, and the document's key listeners.
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.textContent = "";
    this.hidden = true;
    this.disabled = false;
    this.inert = false;
    this.dataset = {};
    this.children = [];
    this.focused = 0;
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }
  setAttribute() {}
  querySelector() { return null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { this.focused += 1; document.activeElement = this; }
}

const ids = ["round-review", "round-review-title", "round-review-trick", "round-review-status", "round-review-costly",
  "round-review-previous", "round-review-next", "round-review-back",
  "round-review-hand-bottom", "round-review-hand-left", "round-review-hand-top", "round-review-hand-right"];
const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new FakeElement(id.includes("previous") || id.includes("next") || id.endsWith("back") ? "button" : "div")]));
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
globalThis.playerName = (name) => name;
globalThis.cardElement = (card) => {
  const element = new FakeElement("div");
  element.card = card;
  return element;
};

Object.assign(globalThis, require("../static/review-analysis.js"));
globalThis.cardName = (card) => `${card.rank}${card.symbol}`;
const { showRoundReview, hideRoundReview } = require("../static/round-review.js");

const seats = [{ name: "You" }, { name: "Ann" }, { name: "Bo" }, { name: "Cy" }];
const makeReview = () => Array.from({ length: 8 }, (_, index) => {
  const lead = index % 4;
  return {
    cards: [0, 1, 2, 3].map((offset) => {
      const seat = (lead + offset) % 4;
      return { seat, card: { rank: String(index + 1), suit: "HEARTS", symbol: "♥" } };
    }),
    winner: (lead + 2) % 4,
  };
});
const hand = (placement) => elements[`#round-review-hand-${placement}`];
const cardsOf = (placement) => hand(placement).children.filter((child) => child.card);
const open = (extra = {}) => showRoundReview({ review: makeReview(), seats, currentPlayerIndex: 0, onClose: () => {}, ...extra });
const reset = () => {
  hideRoundReview();
  document.activeElement = opener;
  for (const element of Object.values(elements)) element.focused = 0;
};
const key = (name) => listeners.find((entry) => entry.type === "keydown").handler({ key: name, preventDefault() {} });

test("opening shows the deal: overlay up, table locked, Next focused, every hand complete", () => {
  reset();
  open();
  assert.equal(elements["#round-review"].hidden, false);
  assert.equal(main.inert, true);
  assert.equal(elements["#round-review-next"].focused, 1);
  assert.equal(elements["#round-review-status"].textContent, "Deal");
  for (const placement of ["bottom", "left", "top", "right"]) assert.equal(cardsOf(placement).length, 8);
  assert.equal(elements["#round-review-trick"].children.length, 0);
  assert.equal(elements["#round-review-previous"].disabled, true);
  assert.equal(elements["#round-review-next"].disabled, false);
  hideRoundReview();
});

test("Next shows the first trick, its winner and the hands without the cards played", () => {
  reset();
  open();
  elements["#round-review-next"].onclick();
  assert.equal(elements["#round-review-status"].textContent, "Trick 1 of 8 · Bo wins the trick");
  assert.equal(elements["#round-review-trick"].children.length, 4);
  for (const placement of ["bottom", "left", "top", "right"]) assert.equal(cardsOf(placement).length, 7);
  assert.equal(hand("top").classList.contains("review-winner"), true, "seat 2 sits at the top of seat 0's table");
  assert.equal(hand("bottom").classList.contains("review-winner"), false);
  assert.equal(elements["#round-review-previous"].disabled, false);
  elements["#round-review-previous"].onclick();
  assert.equal(elements["#round-review-status"].textContent, "Deal");
  hideRoundReview();
});

test("Next is disabled on the last trick, whose hands are empty", () => {
  reset();
  open();
  for (let step = 0; step < 8; step += 1) elements["#round-review-next"].onclick();
  assert.equal(elements["#round-review-status"].textContent.startsWith("Trick 8 of 8"), true);
  assert.equal(elements["#round-review-next"].disabled, true);
  assert.equal(cardsOf("bottom").length, 0);
  hideRoundReview();
});

test("the arrow keys step and Escape goes back to the result", () => {
  reset();
  let closed = 0;
  open({ onClose: () => { closed += 1; } });
  key("ArrowRight");
  key("ArrowRight");
  assert.equal(elements["#round-review-status"].textContent.startsWith("Trick 2 of 8"), true);
  key("ArrowLeft");
  assert.equal(elements["#round-review-status"].textContent.startsWith("Trick 1 of 8"), true);
  key("Escape");
  assert.equal(closed, 1);
  assert.equal(elements["#round-review"].hidden, true);
});

test("Back to result closes it and tells the page once", () => {
  reset();
  let closed = 0;
  open({ onClose: () => { closed += 1; } });
  elements["#round-review-back"].onclick();
  assert.equal(closed, 1);
  assert.equal(elements["#round-review"].hidden, true);
});

test("seats sit relative to the viewer: the viewer's own hand is at the bottom", () => {
  reset();
  open({ currentPlayerIndex: 2 });
  elements["#round-review-next"].onclick();
  // Seat 2 is at the bottom, so seat 0 (two places on) is at the top, and the winner of trick 1 (seat 2) is the bottom.
  assert.equal(hand("bottom").classList.contains("review-winner"), true);
  assert.equal(hand("bottom").children[0].textContent, "Bo");
  hideRoundReview();
});

test("closing unlocks the table, drops the key listener and restores focus; hiding directly does not call onClose", () => {
  reset();
  let closed = 0;
  open({ onClose: () => { closed += 1; } });
  hideRoundReview();
  assert.equal(main.inert, false);
  assert.equal(listeners.filter((entry) => entry.type === "keydown").length, 0);
  assert.equal(document.activeElement, opener);
  assert.equal(closed, 0);
});

test("opening twice leaves one key listener and restores focus to the first opener", () => {
  reset();
  open();
  open();
  assert.equal(listeners.filter((entry) => entry.type === "keydown").length, 1);
  hideRoundReview();
  assert.equal(document.activeElement, opener);
});

test("hiding before any open does not throw", () => {
  reset();
  assert.doesNotThrow(() => hideRoundReview());
});

test("the costly cards of the analysis are told at the trick they were played in (US-067)", async () => {
  reset();
  const analysis = { complete: true, costly: [{ trick: 0, position: 0, played: { rank: "1", symbol: "♥" }, best: { rank: "9", symbol: "♠" }, pointsLost: 14 }] };
  open({ loadAnalysis: () => Promise.resolve(analysis) });
  assert.match(elements["#round-review-costly"].textContent, /Analysing/);
  await Promise.resolve();
  await Promise.resolve();
  assert.match(elements["#round-review-costly"].textContent, /Costly cards: 1/);
  key("ArrowRight");
  assert.equal(elements["#round-review-costly"].textContent, "Your 1♥ cost your team 14 points; the 9♠ was better.");
  key("ArrowRight");
  assert.equal(elements["#round-review-costly"].hidden, true);
  reset();
});

test("without an analysis the review says nothing about costly cards", () => {
  reset();
  open();
  assert.equal(elements["#round-review-costly"].hidden, true);
  reset();
});
