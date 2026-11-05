# Play again in one tap (US-114) — implementation plan

Spec: `docs/superpowers/specs/2026-11-06-play-again-design.md`.

### Task 1: Rematch vote on the server
- `Table`: `rematch_votes`, `rematch_voted()`, `rematch_pending()`; `Action::Rematch` records the vote online and
  deals once nobody is pending; a deal clears the votes. Snapshot `MatchView.rematch_voted/rematch_pending`.
- Tests (`tests/table_flow.rs`): two humans, one votes (no new match, pending lists the other, voting twice is a
  no-op), the other votes (new match, votes cleared); a solo rematch is still immediate; a disconnected human and
  bots do not hold the rematch up.

### Task 2: Match-end screen
- `index.html`: `#match-end-rematch` status line and a "Change options" secondary link; "Home" becomes
  "Back to home".
- `match-end.js`/`app.js`: the model carries `rematch` (`{ voted, pending, names, you }`); the primary button
  label and state follow it; "Change options" is shown for a solo game only; the private rematch button no longer
  closes the screen on click.
- `frontend-tests/play-again.test.cjs`: labels and states for no vote, my vote, someone else's vote; options link
  only for solo; texts translated.

### Task 3: Check and ship
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, frontend tests.
- Browser check at 390 × 844: solo screen buttons; two tabs at a private table for the proposal.
- Commit `feat: play again in one tap (US-114)`, open the PR with auto-merge (squash).
