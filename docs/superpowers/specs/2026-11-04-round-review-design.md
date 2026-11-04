# Review a finished round (US-066) — design

## Goal

From the round result, the player can replay the tricks of the round that just
ended. From the backlog (`docs/product-backlog.md`):

- From the round result, the player can step through the tricks one by one,
  seeing who played each card and who won the trick.
- In solo games all four hands are shown during the review; in online games only
  the cards that were played are shown.
- New texts are translated into French and Dutch.

The server part is small (`beelot-game` and `beelot-server`); the rest is the
frontend (`crates/beelot-server/static/`). No new dependency, no new Settings
option, no database or history change.

## Decisions

All decided with the user.

- **Same review in every mode.** The review shows each seat's remaining hand in
  solo, pass-and-play and online games. By the end of a round all 32 cards have
  been played, so every hand can be rebuilt from the tricks and nothing private
  is shown. This widens the second criterion for online games on purpose: one
  screen to build and test, and the most to learn from. Rejected: following the
  criterion literally, which needs a second layout and a mode switch.
- **The server sends the review.** The finished round's snapshot carries its
  tricks and their winners, so a reload or a late join still has them and the
  winners come from the rules engine. Rejected: recording the tricks in the
  client while playing (wrong after a reload or a late join, and the rules would
  be in two places).
- **The review runs on the real table.** The face-up card table with each seat's
  hand, the trick in the middle and the winner highlighted. Rejected: a
  takeover panel with a small diamond of four cards and hand rows (easier to
  build, but it looks less like the game and repeats card layout).
- **Cards and winner only.** No points per trick and no running totals: the
  round's points are already on the result, and US-067 will add the costly
  mistakes. Rejected: showing "+23 points" per trick.

## Server

`RoundResultView` (`crates/beelot-server/src/api/snapshot.rs`) gains `review`,
present once the round is over and left out otherwise (`Option`, skipped when
none), so snapshots of a round in progress do not change:

```json
"review": [
  { "cards": [ { "seat": 2, "card": { "suit": "hearts", "rank": "ace" } }, … ],
    "winner": 0 },
  …
]
```

- It lists the round's tricks in the order they were played, eight in a full
  round. `cards` are in play order, so the first card is the lead.
- `winner` is the seat that won the trick, computed by the rules engine
  (`beelot-game`) with the round's trump, not recomputed in the client.
- It covers the round that just ended only: the board keeps its tricks until the
  next round starts.
- The existing contract files that show a round result change; they are
  regenerated with `UPDATE_CONTRACT=1` and the diff checked.

## Client

- **The pure part**, in a new `static/round-review.js` loaded before `app.js`,
  exported for Node as the other pure modules are:
  `roundReviewModel({ review, step })` returns `{ step, steps, trick, winner,
  hands }`, or null when `review` is missing or empty. `step` runs from 0
  ("Deal": every hand complete, an empty centre) to the number of tricks (the
  last trick in the centre, hands empty) and is clamped. `trick` is the cards of
  that step's trick in play order (empty at step 0), `winner` the seat that won
  it (null at step 0) and `hands` each seat's cards not yet played, in the order
  they were played.
- **The DOM part**, in `app.js`: a "Review round" button on the round result in
  bot games (also used by pass-and-play) and private tables; a review mode that
  hides the result panel and draws the table face-up from the model, with
  "Previous", "Next", a counter and "Back to result".

### Behaviour

- Review opens at step 0. "Next" and "Previous" move one step and are disabled
  at the ends; ← and → do the same and Escape goes back to the result.
- The counter reads "Deal" at step 0 and "Trick {0} of {1}" after.
- When a trick is shown, the winner's seat is highlighted and the status line
  reads "{name} wins the trick". Names come from the board's seats.
- The step is kept in memory only. A new round, a rematch or leaving the table
  closes the review; so does a re-render that no longer has a result.
- In pass-and-play the review shows all four hands; it is for the whole table
  and needs no hand-off.
- The hidden hands and the hand-off cover of pass-and-play are not used here:
  the round is over.

### Effects levels (US-094)

No new animation. At Full the cards enter with the table's existing deal and
play movement; Reduced and Off show them at once.

### Texts

New strings go through `t()` with French and Dutch entries: "Review round",
"Previous", "Next", "Deal", "Trick {0} of {1}", "Back to result" and "{0} wins
the trick". The French and Dutch wording needs a native speaker's review before
auto-merge.

### Accessibility

The buttons are real buttons with visible focus. The counter and the status
line are in a polite live region, so a screen reader announces each step. The
seat of the winner is marked with text as well as colour.

## Testing

- **Rust:** unit tests for the review in `beelot-game` (eight tricks, the lead
  seat, winners with a trump suit, with all trumps and with no trump) and a
  `table_flow` check that the snapshot after a round carries it and a round in
  progress does not.
- **Node unit tests** for `roundReviewModel`: step 0 has every hand complete and
  an empty centre; each step's hand sizes; the last step has empty hands; steps
  out of range are clamped; a missing or empty review gives null.
- **Browser check** at Full, Reduced and Off, on a phone and a desktop; on a bot
  game, pass-and-play and, if an account is available, a private table; the
  buttons, the arrow keys, Escape, the counter and the highlighted winner; a
  reload on the round result; a new round closing the review.
- The usual checks: `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test --workspace` and `node --test
  crates/beelot-server/frontend-tests/`.

## Out of scope

- Reviewing earlier rounds, points per trick and running totals.
- Pointing out mistakes (US-067), exporting or sharing a round.
