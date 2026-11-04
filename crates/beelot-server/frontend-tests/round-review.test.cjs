const test = require("node:test");
const assert = require("node:assert/strict");
const { roundReviewModel } = require("../static/round-review.js");

// An eight-trick review: trick n is led by seat (n - 1) % 4 and every seat plays one card per trick. The card of
// seat s in trick n is named `${n}-${s}`, so it is easy to see who played what and when.
const card = (trick, seat) => ({ rank: String(trick), suit: "HEARTS", symbol: "♥", id: `${trick}-${seat}` });
const makeReview = (tricks = 8) => Array.from({ length: tricks }, (_, index) => {
  const lead = index % 4;
  return {
    cards: [0, 1, 2, 3].map((offset) => {
      const seat = (lead + offset) % 4;
      return { seat, card: card(index + 1, seat) };
    }),
    winner: (lead + 2) % 4,
  };
});
const ids = (cards) => cards.map((entry) => entry.id);

test("step 0 is the deal: every hand complete, nothing on the table", () => {
  const model = roundReviewModel({ review: makeReview(), step: 0 });
  assert.equal(model.step, 0);
  assert.equal(model.steps, 8);
  assert.deepEqual(model.trick, []);
  assert.equal(model.winner, null);
  assert.deepEqual(model.hands.map((hand) => hand.length), [8, 8, 8, 8]);
  assert.deepEqual(ids(model.hands[2]), ["1-2", "2-2", "3-2", "4-2", "5-2", "6-2", "7-2", "8-2"]);
});

test("a step shows its trick in play order, its winner, and the hands without the cards played", () => {
  const model = roundReviewModel({ review: makeReview(), step: 2 });
  assert.deepEqual(model.trick.map((played) => played.seat), [1, 2, 3, 0]);
  assert.equal(model.winner, 3);
  assert.deepEqual(model.hands.map((hand) => hand.length), [6, 6, 6, 6]);
  assert.deepEqual(ids(model.hands[1]).slice(0, 2), ["3-1", "4-1"]);
});

test("the last step has the last trick on the table and empty hands", () => {
  const model = roundReviewModel({ review: makeReview(), step: 8 });
  assert.equal(model.trick.length, 4);
  assert.equal(model.trick[0].card.id, "8-3");
  assert.deepEqual(model.hands, [[], [], [], []]);
});

test("steps out of range are clamped and fractions floored", () => {
  assert.equal(roundReviewModel({ review: makeReview(), step: -3 }).step, 0);
  assert.equal(roundReviewModel({ review: makeReview(), step: 99 }).step, 8);
  assert.equal(roundReviewModel({ review: makeReview(), step: 2.9 }).step, 2);
  assert.equal(roundReviewModel({ review: makeReview() }).step, 0);
});

test("a short review has as many steps as tricks", () => {
  const model = roundReviewModel({ review: makeReview(3), step: 0 });
  assert.equal(model.steps, 3);
  assert.deepEqual(model.hands.map((hand) => hand.length), [3, 3, 3, 3]);
});

test("there is no model without a review", () => {
  assert.equal(roundReviewModel({ review: undefined, step: 0 }), null);
  assert.equal(roundReviewModel({ review: null, step: 0 }), null);
  assert.equal(roundReviewModel({ review: [], step: 0 }), null);
});
