# Review a finished round (US-066) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a round result, the player opens a face-up review of the round just played and steps through its tricks, seeing every hand, who played each card and who won each trick.

**Architecture:** `GameBoard` already keeps each trick of the round; it also keeps each trick's winner, and the snapshot's `RoundResultView` carries both as `review` once the round is over. A new `static/round-review.js` has a pure model (`roundReviewModel`, tested in Node) and a thin DOM part driving one shared `#round-review` overlay; `app.js` opens it from a "Review round" button on the two round-result panels.

**Tech Stack:** Rust (`beelot-game`, `beelot-server`, serde), plain browser JavaScript and CSS in `crates/beelot-server/static/`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-round-review-design.md`

## Global Constraints

- No new dependency, no new Settings option, no database or history change.
- `review` is in the snapshot only once the round is over (`Option`, left out of the JSON otherwise); snapshots of a round in progress do not change. The contract files that show a round result change and are regenerated with `UPDATE_CONTRACT=1` and the diff checked.
- Cards in the review are `CardView` (`{ rank, suit, symbol }`), the shape `cardElement(card)` draws.
- The review shows every hand in every mode (solo, pass-and-play, online), rebuilt from the tricks.
- Steps run from 0 ("Deal": every hand complete, empty centre) to the number of tricks (last trick in the centre, hands empty), clamped. Step 0 is where it opens.
- No points per trick and no running totals; no new animation (cards just appear; Full uses no extra movement either), so Reduced and Off need no extra rules.
- The overlay is a modal dialog: focus to "Next" on open, back to "Review round" on close, `main` `inert` while open, Escape = back to the result, ← and → step.
- Every new text goes through `t()` with French (`i18n.js`) and Dutch (`i18n-nl.js`) entries.
- `round-review.js` must load in Node (no DOM access at top level), exporting through `if (typeof module !== "undefined")`.
- Commits are signed, one per task, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; pull request title `feat: review a finished round (US-066)`.

## Review Focus

- A round whose last trick was won by the capot team or with all trumps / no trump: the winner in `review` is the seat the rules engine gave the trick to, for every trick, in every variant.
- `review` is absent while the round is in progress and after a new round starts (a stale review of the last round must never show on the next round's board).
- Hands rebuilt from the tricks are complete at step 0 (8 cards each), shrink by one per step, and are empty at the last step.
- Every close path (Back to result, Escape, a new round, a rematch, leaving the table, a re-render without a result, the end-of-match screen opening) removes `inert` from `main` and the key listener; a second open never leaves two listeners.
- Pass-and-play: the review shows the four hands face-up without a hand-off, and the seat positions follow the viewer's `currentPlayerIndex`.

---

### Task 1: The review in `beelot-game`

**Files:**
- Modify: `crates/beelot-game/src/board.rs` (a `trick_winners` field, `ReviewedTrick`, `GameBoard::review`)
- Modify: `crates/beelot-game/tests/board.rs` (tests)

**Interfaces:**
- Produces: `pub struct ReviewedTrick { pub cards: Vec<SeatCard>, pub winner: Seat }` (`Clone, Debug, PartialEq, Eq`) and `impl GameBoard { pub fn review(&self) -> Vec<ReviewedTrick> }`: the tricks played so far in order, `cards` in play order (first card is the lead), `winner` the seat that won it. The winner is recorded in `resolve_trick` from the value it already computes.

- [ ] **Step 1: Write the failing tests** in `tests/board.rs`, using `rules_board()` (hearts trump), `play_out` and the file's existing constructors:
  - `the_review_lists_the_eight_tricks_in_order`: after `play_out`, `board.review().len() == 8`, each trick has four cards, the first card of trick 1 is from `board.first_leader()`-equivalent (use the seat that led: `review()[0].cards[0].seat`, compared with the seat the board reported as active before the first play), and the lead of each trick after the first is the previous trick's winner.
  - `every_card_of_the_round_appears_once_in_the_review`: the 32 cards of `Card::deck()` are exactly the cards in the review, no duplicates.
  - `the_review_winner_is_the_seat_the_rules_gave_the_trick_to`: for each reviewed trick, `winner` equals `cards[rules::winning_index(&card_list, trump)].seat`.
  - the same winner check on a board built with all trumps and one with no trump, using the constructors the file's existing all-trumps and no-trump tests use.
  - `a_round_in_progress_reviews_only_the_tricks_played`: after one completed trick `review().len() == 1`; with a fresh board `review()` is empty.

- [ ] **Step 2: Run them to verify they fail.**
  Run: `cargo test -p beelot-game --test board review`
  Expected: FAIL to compile (`review` not found).

- [ ] **Step 3: Implement** `ReviewedTrick` and `review()` in `board.rs`; add a private `trick_winners: Vec<Seat>` to `GameBoard` set to empty in the constructor and pushed in `resolve_trick` with `winner.seat`. `review` zips `self.tricks` with `trick_winners`.

- [ ] **Step 4: Run them to verify they pass.**
  Run: `cargo test -p beelot-game`
  Expected: PASS (all of `beelot-game`).

- [ ] **Step 5: Commit.** `git add crates/beelot-game && git commit -m "feat: keep the winner of each trick for a review (US-066)"`

---

### Task 2: The review in the snapshot

**Files:**
- Modify: `crates/beelot-server/src/api/snapshot.rs` (`RoundResultView`, `round_result_view`, its call near line 532)
- Modify: `crates/beelot-server/tests/table_flow.rs` (one test)
- Regenerate: `crates/beelot-server/tests/contract/round_over_with_announcements.json` and `trick_under_review.json` if they change

**Interfaces:**
- Consumes: `GameBoard::review() -> Vec<ReviewedTrick>` (Task 1).
- Produces: `RoundResultView.review: Option<Vec<ReviewTrickView>>`, serialized as `roundResult.review` (camelCase, skipped when none), with `ReviewTrickView { cards: Vec<ReviewCardView>, winner: usize }` and `ReviewCardView { seat: usize, card: CardView }`. It is `Some` whenever a round result is shown.

- [ ] **Step 1: Write the failing test** `a_finished_round_carries_its_review` in `table_flow.rs`, using the file's `solo(Variant::Classic, seed)`, `play_round(&mut table, Actor::Device)` and `snapshot(&table, Viewer::Device, T0)` as `a_finished_match_carries_its_recap` does: while the round is in progress `value["board"]["roundResult"]` is null and no `review` anywhere; after `play_round`, `value["board"]["roundResult"]["review"]` has 8 entries, each with 4 `cards` having `seat` 0–3 and `card.rank`/`card.suit`, a `winner` 0–3 equal to the lead seat of the next trick (for tricks 1–7), and the 32 cards are all different.

- [ ] **Step 2: Run it to verify it fails.**
  Run: `cargo test -p beelot-server --test table_flow a_finished_round_carries_its_review`
  Expected: FAIL (`review` is null).

- [ ] **Step 3: Add the views and fill them.** `round_result_view` takes the board's `review()` as a new argument; the call site passes `board.review()`. Serialize with `#[serde(skip_serializing_if = "Option::is_none")]` on a field typed `Option<Vec<ReviewTrickView>>`; build it as `Some(...)` in `round_result_view`.

- [ ] **Step 4: Regenerate and read the diff.**
  Run: `UPDATE_CONTRACT=1 cargo test -p beelot-server --test api_contract` then `git diff --stat crates/beelot-server/tests/contract`
  Expected: only files that show a round result change, and only by an added `review` array.

- [ ] **Step 5: Run the whole server suite.**
  Run: `cargo test -p beelot-server`
  Expected: PASS (Docker running).

- [ ] **Step 6: Commit.** `git add crates/beelot-server && git commit -m "feat: send the tricks of a finished round (US-066)"`

---

### Task 3: The review model (pure)

**Files:**
- Create: `crates/beelot-server/static/round-review.js`
- Create: `crates/beelot-server/frontend-tests/round-review.test.cjs`

**Interfaces:**
- Produces, exported from `round-review.js`: `roundReviewModel({ review, step }) -> Model | null`. `review` is `roundResult.review` (`[{ cards: [{ seat, card }], winner }]`); `step` an integer. Returns null when `review` is missing or empty. `Model = { step, steps, trick, winner, hands }`: `steps` is `review.length`; `step` is clamped to `0..steps`; `trick` is `[{ seat, card }]` of that step's trick in play order (`[]` at step 0); `winner` the seat that won it (`null` at step 0); `hands` is four arrays (index = seat) of the cards not yet played after that step, in the order they were played.

- [ ] **Step 1: Write the failing tests** (`node:test`, requiring `../static/round-review.js`) with a small helper that builds an 8-trick review from `cards` where seat `s` plays `rank` of a suit per trick, winners rotating. Tests:
  - step 0: `trick` is `[]`, `winner` is null, every hand has 8 cards, in the order the seat plays them.
  - step 1: the centre is trick 1's four cards in play order, `winner` is trick 1's winner, each hand has 7 cards and no longer has the card it played.
  - step 8 (last): hands are all empty, `trick` is the last trick.
  - steps out of range clamp: `-3` gives step 0, `99` gives step 8; a non-integer step is floored.
  - `steps` equals the number of tricks, also for a review of fewer tricks (3 tricks: 3 cards each at step 0).
  - **Review focus:** null for `undefined`, `null` and `[]`.

- [ ] **Step 2: Run them to verify they fail.**
  Run: `node --test crates/beelot-server/frontend-tests/round-review.test.cjs`
  Expected: FAIL (`Cannot find module '../static/round-review.js'`).

- [ ] **Step 3: Implement `roundReviewModel`** with a header comment in the style of `match-end.js` and the Node export guard.

- [ ] **Step 4: Run them to verify they pass.**
  Run: `node --test crates/beelot-server/frontend-tests/`
  Expected: PASS (all frontend tests).

- [ ] **Step 5: Commit.** `git add crates/beelot-server/static/round-review.js crates/beelot-server/frontend-tests/round-review.test.cjs && git commit -m "feat: model the round review (US-066)"`

---

### Task 4: The overlay (DOM, CSS, texts)

**Files:**
- Modify: `crates/beelot-server/static/round-review.js` (DOM part)
- Modify: `crates/beelot-server/static/index.html` (the overlay after `#match-end`; `<script src="/round-review.js">` after `/match-end.js`)
- Modify: `crates/beelot-server/static/styles.css`, `i18n.js`, `i18n-nl.js`
- Create: `crates/beelot-server/frontend-tests/round-review-overlay.test.cjs`

**Interfaces:**
- Consumes: `roundReviewModel` (Task 3), the page globals `cardElement(card)`, `playerName(name)`, `t`.
- Produces: `showRoundReview({ review, seats, currentPlayerIndex, onClose })` and `hideRoundReview()`, plus the markup in `index.html`: `<div class="round-review" id="round-review" role="dialog" aria-modal="true" aria-labelledby="round-review-title" hidden>` holding `<h2 id="round-review-title">Review round</h2>`, a `.review-table` with four `.review-hand` elements (`#round-review-hand-bottom|left|top|right`, each a name `<small>` and a row of cards) around a `#round-review-trick` centre, `<p id="round-review-status" role="status" aria-live="polite">`, and the actions `#round-review-previous`, `#round-review-next` (buttons), `#round-review-back` ("Back to result").
  - `seats` is `board.seats` (`{ name }`); a seat's placement is `["bottom","left","top","right"][(seat − currentPlayerIndex + 4) % 4]`, as the table does.
  - Opening shows step 0; Next/Previous and ←/→ move a step; Previous is disabled at step 0 and Next at the last step; the status reads `t("Deal")` at 0 and `t("Trick {0} of {1}", step, steps)` after, followed by `t("{0} wins the trick", playerName(winner name))`; the winner's hand gets class `review-winner` and the centre card of the winner `winning-card`. Back and Escape call `onClose` then hide. `hideRoundReview` hides the overlay, removes `inert` and the key listener, restores focus; safe twice and before any open.

- [ ] **Step 1: Write the failing tests** in `round-review-overlay.test.cjs`, with a fake DOM like `match-end-overlay.test.cjs` (elements by id, `main`, recorded document key listeners, stub `globalThis.cardElement = (card) => ({ card })`, `playerName = (n) => n`, `t` substituting `{0}` and `{1}`):
  - opening shows the overlay, makes `main` inert, focuses Next and shows `Deal` with every hand holding 8 cards and an empty centre.
  - Next goes to `Trick 1 of 8 · A wins the trick`-style status (assert the exact string the implementation builds with the test's `t`), the centre has 4 cards, the winner's hand has class `review-winner`, hands shrink to 7; Previous returns; Previous is disabled at 0 and Next at 8.
  - ArrowRight and ArrowLeft step; Escape calls `onClose` once and closes.
  - seat placement follows `currentPlayerIndex`: with `currentPlayerIndex = 2`, seat 2's hand is in `bottom`.
  - **Review focus:** closing removes `inert`, removes the key listener and restores focus; opening twice leaves one listener; `hideRoundReview()` before any open does not throw.

- [ ] **Step 2: Run them to verify they fail.**
  Run: `node --test crates/beelot-server/frontend-tests/`
  Expected: FAIL (`showRoundReview` is not a function).

- [ ] **Step 3: Implement** the DOM part, the markup and the CSS: a fixed full-screen felt page (z-index above the score bar and below `#handoff`; below `#match-end` is not needed because opening the match end closes the review), hands as rows of small face-up cards (reuse `.playing-card`), the centre using the existing `trick-slot-*` classes, 3px outline buttons. Add French and Dutch texts for "Review round", "Previous", "Next", "Deal", "Trick {0} of {1}", "Back to result", "{0} wins the trick" (omit any key that already exists with the same translation).

- [ ] **Step 4: Run the tests and look at it.** Run `node --test crates/beelot-server/frontend-tests/` (expect PASS). Then start the server and call `showRoundReview` from the console with a hand-built review at 375 px and desktop width: hands readable, nothing scrolls sideways, buttons and keys work.

- [ ] **Step 5: Commit.** `git add crates/beelot-server && git commit -m "feat: show the round review (US-066)"`

---

### Task 5: Wire it into the game and verify

**Files:**
- Modify: `crates/beelot-server/static/app.js` (the two result blocks, the next-round and rematch handlers, `renderView`, `openMatchEnd`)
- Modify: `crates/beelot-server/static/index.html` (a "Review round" button in each round-result panel)
- Modify: `docs/superpowers/specs/2026-11-04-round-review-design.md` (the overlay ruling), `docs/superpowers/plans/2026-11-04-round-review.md` (a "Findings" section at the end)

**Interfaces:**
- Consumes: `showRoundReview`, `hideRoundReview`, `roundResult.review`, `board.seats`, `board.currentPlayerIndex`.
- Produces: in `app.js`, `openRoundReview(board, round)` and `closeRoundReview()`.

- [ ] **Step 1: Add the buttons.** In both round-result panels add `<button class="button secondary-button" hidden id="review-button" type="button">Review round</button>` and `id="private-review-button"`; show each whenever its result has a non-empty `review`.

- [ ] **Step 2: Add `openRoundReview` and `closeRoundReview`** next to `openMatchEnd`. The buttons call `openRoundReview(board, round)` (the current board and its result, kept in module state when the result block renders). `closeRoundReview` calls `hideRoundReview`. Call it from: the next-round and rematch handlers (both modes), the `else` branches that clear the result (next to `resetMatchEnd`), `renderView`'s game-change block (next to `closeMatchEnd`) and the start of `openMatchEnd` (the end-of-match screen takes over).

- [ ] **Step 3: Amend the spec.** Replace the sentence saying the review "hides the result panel and draws the table face-up" with: the review is a modal overlay drawn like the table (four face-up hands around the trick), shared by every mode, so it reuses the card elements and trick-slot positions without the live table's reveal state, sounds and flights.

- [ ] **Step 4: Verify in the browser** (server running; refetch changed files with `fetch(path, { cache: "reload" })`): play a bot round to its result, open "Review round", step with the buttons and arrow keys, Escape and Back, check the counter, the highlighted winner and the hands at Full, Reduced and Off, at 375 px and desktop; a reload on the result; "Deal next round" with the review open is not possible (inert) but closing it first works; a new round never shows the previous review; the match-end screen opens over a review. Record what was and was not verified in a "Findings" section of this plan.

- [ ] **Step 5: Run the checks and commit.**
  Run: `node --test crates/beelot-server/frontend-tests/ && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --workspace`
  Expected: all pass (Docker running).
  `git add -A crates docs && git commit -m "feat: open the round review from the result (US-066)"`

- [ ] **Step 6: Open the pull request** after `git fetch origin main:main` and a rebase on it, titled `feat: review a finished round (US-066)`, with the commands run, what was not verified, and the note that the French and Dutch wording needs a native check; then `gh pr merge --auto --squash`.
