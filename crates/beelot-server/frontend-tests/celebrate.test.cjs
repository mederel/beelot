const test = require("node:test");
const assert = require("node:assert/strict");

// A minimal stand-in for the DOM: enough of an element to build, find and remove a celebration.
class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.parent = null;
    this.style = { properties: {}, setProperty(name, value) { this.properties[name] = value; } };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) {
    nodes.forEach((node) => { node.parent = this; this.children.push(node); });
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  querySelectorAll(selector) {
    return this.children.filter((child) => child.className.split(" ").includes(selector.slice(1)));
  }
}

const timers = [];
const played = [];
globalThis.document = { createElement: (tag) => new FakeElement(tag) };
globalThis.window = { setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; } };
globalThis.t = (text) => `T(${text})`;
globalThis.playSound = (name) => played.push(name);

const { celebrate } = require("../static/celebrations.js");

const reset = () => { timers.length = 0; played.length = 0; };
const pieces = (element) => element.children.filter((child) => child.tag === "i");

test("a celebration is one hidden element with the translated sticker", () => {
  reset();
  const table = new FakeElement("div");
  const element = celebrate(table, "capot");
  assert.equal(table.querySelectorAll(".celebration").length, 1);
  assert.equal(element.attributes["aria-hidden"], "true");
  assert.equal(element.dataset.kind, "capot");
  assert.equal(element.dataset.effect, "confetti");
  const sticker = element.children.find((child) => child.className === "celebration-sticker");
  assert.equal(sticker.textContent, "T(Capot!)");
});

test("the moment's sound plays", () => {
  reset();
  celebrate(new FakeElement("div"), "roundWon");
  celebrate(new FakeElement("div"), "rebelote");
  assert.deepEqual(played, ["roundWin", "belote"]);
});

test("confetti has 14 pieces, and a moment without an effect has none", () => {
  reset();
  assert.equal(pieces(celebrate(new FakeElement("div"), "matchWin")).length, 14);
  assert.equal(pieces(celebrate(new FakeElement("div"), "coincheWon")).length, 14);
  assert.equal(pieces(celebrate(new FakeElement("div"), "contractLost")).length, 0);
  assert.equal(pieces(celebrate(new FakeElement("div"), "belote")).length, 0);
});

test("chips are listed, translated except the points", () => {
  reset();
  const element = celebrate(new FakeElement("div"), "capot", [
    { kind: "belote", text: "Belote ✓" },
    { kind: "points", text: "+250" },
  ]);
  const list = element.children.find((child) => child.className === "celebration-chips");
  assert.deepEqual(list.children.map((chip) => chip.textContent), ["T(Belote ✓)", "+250"]);
  assert.deepEqual(list.children.map((chip) => chip.dataset.kind), ["belote", "points"]);
});

test("a new celebration replaces the one still showing", () => {
  reset();
  const table = new FakeElement("div");
  celebrate(table, "capot");
  celebrate(table, "roundWon");
  const showing = table.querySelectorAll(".celebration");
  assert.equal(showing.length, 1);
  assert.equal(showing[0].dataset.kind, "roundWon");
});

test("the element removes itself after 1.8 seconds", () => {
  reset();
  const table = new FakeElement("div");
  celebrate(table, "capot");
  assert.equal(timers.at(-1).delay, 1800);
  timers.at(-1).callback();
  assert.equal(table.querySelectorAll(".celebration").length, 0);
});

test("an unknown moment shows nothing", () => {
  reset();
  const table = new FakeElement("div");
  assert.equal(celebrate(table, "banana"), null);
  assert.equal(table.children.length, 0);
  assert.deepEqual(played, []);
});
