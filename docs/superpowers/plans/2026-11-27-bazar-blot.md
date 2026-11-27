# Plan: play Armenian Belote (Bazar Blot) with an Armenian UI (US-216)

Design: `docs/superpowers/specs/2026-11-27-bazar-blot-design.md`. Issue: #509.

1. **Spec and plan.** Commit the design and this plan.
2. **Game rules, tests first.** `Variant::BazarBlot`; the deal, the bazar, contra and recontra in `bidding.rs`; the
   Armenian declarations in `announcements.rs`; `GameBoard::from_bazar_blot`; `sai` and `score_bazar_blot` in
   `scoring.rs`; `targets` and `default_target` in `match_score.rs`; `tests/bazar_blot.rs` with a hand-worked deal.
3. **Bots, arena, fixtures.** The Bazar auction decision (bid, raise, contra, recontra); bot rounds and matches with the
   legality check; `--variant bazar-blot`; `fixtures/deals-bazar-blot.jsonl` and its replay test.
4. **Table and server.** `Action::Recontra`, messages, refusals, targets per variant, database code, statistics,
   leaderboard, snapshot (`recontraAllowed`, `recontra`), the tests that list the variants.
5. **Frontend.** Types, setup sheet with the targets per variant, lobbies, leaderboard, stats, auction sheet (numbers,
   kaput, contra, recontra), round breakdown, rules page; French, Dutch and Bulgarian texts; model tests; key screen.
6. **Armenian.** `hy.ts`, the language choice, Noto Sans Armenian with its `unicode-range`, the font range test, the
   coverage tests and fixtures, the Armenian long-text layout checks; `npm run build` and the rebuilt `static/`.
7. **Docs.** `pages/docs/bazar-blot.html`, the docs navigations, the README.
8. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and in `web/`
   `npm ci && npm run check && npm run lint && npm test && npm run build`; the e2e layout checks.
9. **Pull request** `feat: play Armenian Belote (Bazar Blot) with an Armenian UI (US-216)`, `Closes #509`, rebased on a
   fresh `main`, auto-merge with squash, watch CI.
