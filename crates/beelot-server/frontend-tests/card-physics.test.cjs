const test = require("node:test");
const assert = require("node:assert/strict");
const { fanFor, restAngle, flightVector, reasonText } = require("../static/card-physics.js");

const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

test("one card rests flat", () => {
  assert.deepEqual(fanFor(0, 1), { rotation: 0, offsetY: 0 });
});

test("the fan is symmetric around the centre and bounded at 14 degrees", () => {
  for (let count = 1; count <= 8; count += 1) {
    for (let index = 0; index < count; index += 1) {
      const here = fanFor(index, count);
      const mirror = fanFor(count - 1 - index, count);
      assert.equal(here.rotation, -mirror.rotation + 0, `${index}/${count}`);
      assert.equal(here.offsetY, mirror.offsetY);
      assert.ok(Math.abs(here.rotation) <= 14, `${index}/${count}`);
    }
  }
});

test("eight cards span 14 degrees at the ends and drop the outer cards", () => {
  assert.equal(fanFor(0, 8).rotation, -14);
  assert.equal(fanFor(7, 8).rotation, 14);
  assert.ok(fanFor(0, 8).offsetY > fanFor(3, 8).offsetY);
  assert.ok(fanFor(3, 8).offsetY > 0);
});

test("a short hand fans less than a full one", () => {
  assert.equal(fanFor(1, 3).rotation, 0);
  assert.equal(fanFor(2, 3).rotation, 4);
});

test("restAngle is stable for a card and within three degrees for all 32", () => {
  const angles = new Set();
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const angle = restAngle({ rank, suit });
      assert.equal(angle, restAngle({ rank, suit }));
      assert.ok(angle >= -3 && angle <= 3, `${rank}-${suit}: ${angle}`);
      angles.add(angle);
    }
  }
  assert.ok(angles.size > 8, "the angles differ from card to card");
});

test("flightVector is the origin centre minus the slot centre", () => {
  const slot = { left: 100, top: 200, width: 46, height: 66 };
  const origin = { left: 130, top: 180, width: 46, height: 66 };
  assert.deepEqual(flightVector(origin, slot), { x: 30, y: -20 });
  const wider = { left: 0, top: 0, width: 100, height: 40 };
  assert.deepEqual(flightVector(wider, { left: 10, top: 10, width: 20, height: 20 }), { x: 30, y: 0 });
});

test("reasonText gives the key and the suit for each reason", () => {
  assert.deepEqual(reasonText({ reason: "MUST_FOLLOW", suit: "HEARTS" }, "Spades"),
    { key: "Follow the suit led: {0}", suit: "HEARTS" });
  assert.deepEqual(reasonText({ reason: "MUST_TRUMP" }, "Spades"), { key: "You must trump.", suit: null });
  assert.deepEqual(reasonText({ reason: "MUST_OVERTRUMP" }, "Spades"), { key: "Play a higher trump.", suit: null });
});

test("under all trumps an overtrump asks for a higher card", () => {
  for (const trump of ["All trumps", "ALL_TRUMPS"]) {
    assert.deepEqual(reasonText({ reason: "MUST_OVERTRUMP" }, trump), { key: "Play a higher card.", suit: null });
  }
});

test("every reason text is translated into French and Dutch", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (name) => fs.readFileSync(path.join(__dirname, "..", "static", name), "utf8");
  const keys = ["Follow the suit led: {0}", "You must trump.", "Play a higher trump.", "Play a higher card."];
  for (const key of keys) {
    for (const file of ["i18n.js", "i18n-nl.js"]) {
      assert.ok(read(file).includes(`${JSON.stringify(key)}:`), `${file}: ${key}`);
    }
  }
});

const { arrivalOrder } = require("../static/card-physics.js");

test("the first deal shows the cards in the order the deal gave them", () => {
  const dealt = ["K-HEARTS", "7-CLUBS", "A-SPADES", "9-HEARTS", "J-CLUBS"];
  assert.deepEqual(arrivalOrder([], dealt), dealt);
});

test("a second deal keeps the held cards first and adds the new ones in deal order", () => {
  const held = ["7-CLUBS", "J-CLUBS", "9-HEARTS", "K-HEARTS", "A-SPADES"];
  const dealt = ["K-HEARTS", "7-CLUBS", "A-SPADES", "9-HEARTS", "J-CLUBS", "Q-SPADES", "8-DIAMONDS", "10-CLUBS"];
  assert.deepEqual(arrivalOrder(held, dealt), [...held, "Q-SPADES", "8-DIAMONDS", "10-CLUBS"]);
});

test("the taker's upturned card, first in the server's order, arrives after their packet", () => {
  const held = ["7-CLUBS", "J-CLUBS", "9-HEARTS", "K-HEARTS", "A-SPADES"];
  const dealt = [...held, "Q-SPADES", "8-DIAMONDS", "10-CLUBS"];
  assert.deepEqual(arrivalOrder(held, dealt, true), [...held, "8-DIAMONDS", "10-CLUBS", "Q-SPADES"]);
});

test("the arrival order holds the same cards as the deal", () => {
  const dealt = ["K-HEARTS", "7-CLUBS", "A-SPADES"];
  assert.deepEqual([...arrivalOrder(["7-CLUBS"], dealt, true)].sort(), [...dealt].sort());
});
