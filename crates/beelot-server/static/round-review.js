// The review of a finished round (US-066): what the table shows at each step. The page draws it.
// `review` is the snapshot's `roundResult.review`, the tricks in order as `[{ cards: [{ seat, card }], winner }]`
// with the cards in play order.

// The model of one step, or null when there is no review: `{ step, steps, trick, winner, hands }`.
// Step 0 is the deal (every hand complete, nothing on the table); step n shows trick n on the table. `step` is
// floored and clamped to 0..steps. `hands` are the four seats' cards not yet played after the step, in the order
// they were played; `winner` is null at step 0.
function roundReviewModel({ review, step = 0 }) {
  if (!Array.isArray(review) || review.length === 0) return null;
  const steps = review.length;
  const shown = Math.min(steps, Math.max(0, Math.floor(Number(step) || 0)));
  const hands = [[], [], [], []];
  review.forEach((trick, index) => {
    if (index < shown) return;
    for (const { seat, card } of trick.cards) hands[seat].push(card);
  });
  const current = shown > 0 ? review[shown - 1] : null;
  return {
    step: shown,
    steps,
    trick: current ? current.cards : [],
    winner: current ? current.winner : null,
    hands,
  };
}

if (typeof module !== "undefined") module.exports = { roundReviewModel };
