# Plan: play Klaberjass (US-219)

Design: `docs/superpowers/specs/2026-11-26-klaberjass-design.md`. Issue: #512.

1. **Spec and plan.** Commit the design and this plan.
2. **Rules engine** (`beelot-game`). `Variant::Klaberjass` and `seat_count()`; seat count in `BiddingState` and `GameBoard`;
   nine tricks; scoring; tests first in `tests/klaberjass.rs` (deal, auction, must-trump, last trick, scoring).
3. **Bot** (`bot::klaberjass`), and a bot-vs-bot test that plays whole matches.
4. **Table** (`beelot-table`). Seat count from the lobby: seating, bot fill, local seats, dealers, undo, rematch,
   reactions, messages. The 4-seat tests stay green; new 2-seat tests cover the lobby, a solo match, undo and rematch.
5. **Server.** Variant text code, snapshot seat count, route validation, matchmaking, leaderboard checks.
6. **Frontend.** Two-seat layout, variant chooser, lobby options, auction card, i18n (en/fr/nl), unit tests, layout checks;
   `npm run build` and the rebuilt `static/`.
7. **Docs.** `pages/docs/klaberjass.html` and the index of docs pages.
8. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and the frontend
   commands; report the ones that cannot run here.
9. **Pull request** `feat: play Klaberjass, the two-player game of the family`, `Closes #512`, auto-merge.
