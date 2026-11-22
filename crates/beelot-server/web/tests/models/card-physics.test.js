import { test } from "vitest";
import assert from "node:assert/strict";
import { restAngle, reasonText } from "$lib/models/card-physics";

const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

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

test("reasonText gives the key and the suit for each reason", () => {
  assert.deepEqual(reasonText({ reason: "MUST_FOLLOW", suit: "HEARTS" }, "Spades"), { key: "Follow the suit led: {0}", suit: "HEARTS" });
  assert.deepEqual(reasonText({ reason: "MUST_TRUMP" }, "Spades"), { key: "You must trump.", suit: null });
  assert.deepEqual(reasonText({ reason: "MUST_OVERTRUMP" }, "Spades"), { key: "Play a higher trump.", suit: null });
});

test("under all trumps an overtrump asks for a higher card", () => {
  for (const trump of ["All trumps", "ALL_TRUMPS"]) {
    assert.deepEqual(reasonText({ reason: "MUST_OVERTRUMP" }, trump), { key: "Play a higher card.", suit: null });
  }
});

import { arrivalOrder } from "$lib/models/card-physics";

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
