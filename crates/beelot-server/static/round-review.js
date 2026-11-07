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

const REVIEW_PLACEMENTS = ["bottom", "left", "top", "right"];

let reviewState = null;
let reviewOpener = null;
let reviewKeyHandler = null;

function reviewElement(id) {
  return document.querySelector(`#round-review-${id}`);
}

function reviewLabel(name) {
  return typeof playerName === "function" ? playerName(name) : name;
}

// Where a seat sits on the review table: the viewer's own seat is at the bottom, as at the real table.
function reviewPlacement(seat, currentPlayerIndex) {
  return REVIEW_PLACEMENTS[(seat - currentPlayerIndex + 4) % 4];
}

function renderRoundReview() {
  const { review, seats, currentPlayerIndex } = reviewState;
  const model = roundReviewModel({ review, step: reviewState.step });
  reviewState.step = model.step;
  const winnerName = model.winner === null ? "" : reviewLabel(seats[model.winner].name);

  model.hands.forEach((cards, seat) => {
    const placement = reviewPlacement(seat, currentPlayerIndex);
    const element = reviewElement(`hand-${placement}`);
    const name = document.createElement("small");
    name.className = "review-name";
    name.textContent = reviewLabel(seats[seat].name);
    element.replaceChildren(name, ...cards.map((card) => cardElement(card)));
    element.classList.toggle("review-winner", seat === model.winner);
  });

  reviewElement("trick").replaceChildren(...model.trick.map(({ seat, card }) => {
    const slot = document.createElement("div");
    slot.className = `review-slot review-slot-${reviewPlacement(seat, currentPlayerIndex)}`;
    const played = cardElement(card);
    if (seat === model.winner) {
      slot.classList.add("trick-winner");
      played.classList.add("winning-card");
    }
    slot.append(played);
    return slot;
  }));

  const costly = reviewElement("costly");
  if (model.step === 0) {
    const summary = costlySummary(reviewState.analysis);
    costly.textContent = summary ? t(summary.text, ...summary.values) : "";
  } else {
    const entries = costlyAtStep(reviewState.analysis, model.step);
    costly.textContent = entries
      .map((entry) => t("Your {0} cost your team {1} points; the {2} was better.", cardName(entry.played), entry.pointsLost, cardName(entry.best)))
      .join(" ");
    entries.forEach((entry) => reviewElement("trick").children[entry.position]?.querySelector(".playing-card")?.classList.add("costly-card"));
  }
  costly.hidden = costly.textContent === "";

  reviewElement("status").textContent = model.step === 0
    ? t("Deal")
    : `${t("Trick {0} of {1}", model.step, model.steps)} · ${t("{0} wins the trick", winnerName)}`;
  reviewElement("previous").disabled = model.step === 0;
  reviewElement("next").disabled = model.step === model.steps;
}

function stepRoundReview(by) {
  if (!reviewState) return;
  reviewState.step += by;
  renderRoundReview();
}

// Opens the review of `review` (the round result's tricks) at the deal. `seats` is `board.seats` and
// `currentPlayerIndex` the viewer's seat. `onClose` runs when the player leaves with "Back to result" or Escape.
function showRoundReview({ review, seats, currentPlayerIndex, onClose = () => {}, loadAnalysis = null }) {
  if (roundReviewModel({ review, step: 0 }) === null) return;
  const overlay = document.querySelector("#round-review");
  if (overlay.hidden) reviewOpener = document.activeElement;
  reviewState = { review, seats, currentPlayerIndex, step: 0, analysis: loadAnalysis ? undefined : null };
  const opened = reviewState;
  // The costly cards come from the server when they are ready; the review is usable meanwhile (US-067).
  loadAnalysis?.().then(
    (analysis) => { opened.analysis = analysis; if (reviewState === opened) renderRoundReview(); },
    () => { opened.analysis = null; if (reviewState === opened) renderRoundReview(); }
  );

  const leave = () => {
    onClose();
    hideRoundReview();
  };
  reviewElement("previous").onclick = () => stepRoundReview(-1);
  reviewElement("next").onclick = () => stepRoundReview(1);
  reviewElement("back").onclick = leave;
  if (reviewKeyHandler) document.removeEventListener("keydown", reviewKeyHandler);
  reviewKeyHandler = (event) => {
    if (event.key === "ArrowRight") stepRoundReview(1);
    else if (event.key === "ArrowLeft") stepRoundReview(-1);
    else if (event.key === "Escape") leave();
  };
  document.addEventListener("keydown", reviewKeyHandler);

  renderRoundReview();
  overlay.hidden = false;
  document.querySelector("main").inert = true;
  reviewElement("next").focus();
}

// Closes the review: unlocks the table, drops the key listener and gives the focus back. Safe when it is not open.
function hideRoundReview() {
  const overlay = document.querySelector("#round-review");
  if (!overlay) return;
  overlay.hidden = true;
  reviewState = null;
  const main = document.querySelector("main");
  if (main) main.inert = false;
  if (reviewKeyHandler) {
    document.removeEventListener("keydown", reviewKeyHandler);
    reviewKeyHandler = null;
  }
  const opener = reviewOpener;
  reviewOpener = null;
  opener?.focus?.();
}

if (typeof module !== "undefined") module.exports = { roundReviewModel, showRoundReview, hideRoundReview };
