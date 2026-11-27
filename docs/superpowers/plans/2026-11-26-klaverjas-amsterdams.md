# Plan: play Klaverjas with the Amsterdam rules (US-213)

Design: `docs/superpowers/specs/2026-11-26-klaverjas-amsterdams-design.md`. Issue: #506.

1. **Spec and plan.** Commit the design and this plan.
2. **Game rules, tests first.** `Variant::Klaverjas`; the 3-2-3 deal and the auction in `bidding.rs`; the Amsterdam legal
   plays and `IllegalReason::MayNotUndertrump` in `rules.rs`; the `roem` module; `GameBoard::from_klaverjas` and the roem
   of each trick in `board.rs`; nat and pit in `scoring.rs`; `default_target`; `tests/klaverjas.rs` with the hand-checked
   deal.
3. **Bots and arena.** The Klaverjas auction decision; bot rounds and matches with the legality check; `--variant klaverjas`.
4. **Table and server.** Messages, refusals, database code, statistics, leaderboard, snapshot (`trickRoem`,
   `MAY_NOT_UNDERTRUMP`), the tests that list the variants.
5. **Frontend.** Types, setup sheet, lobbies, leaderboard, stats, auction sheet, deal steps, roem toast, round breakdown,
   reason text, rules page; French and Dutch texts; model tests; the two screens in `e2e/key-screens.spec.ts` and their
   approved images; `npm run build` and the rebuilt `static/`.
6. **Docs.** `pages/docs/klaverjas.html`, the docs navigations, the README.
7. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and in `web/`
   `npm ci && npm run check && npm run lint && npm test && npm run build`.
8. **Pull request** `feat: play Klaverjas with the Amsterdam rules (US-213)`, `Closes #506`, auto-merge with squash, watch CI.
