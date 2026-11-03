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
