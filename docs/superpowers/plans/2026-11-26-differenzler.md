# Plan: play Differenzler Jass (US-222)

Design: `docs/superpowers/specs/2026-11-26-differenzler-design.md`. Issue: #515.

0. **Wait for US-220** (#513) to merge into `main`, and reuse US-219's (#512) seat-count work if it has merged. Rebase on
   `main` before step 2.
1. **Spec and plan.** Commit the design and this plan.
2. **Rules.** `Variant::Differenzler`, the deal for 3 and 4 seats, trump without the 6 exchange, undertrump rule, the
   deal's score. Tests first.
3. **Table.** Individual scoring in `MatchScore`, the `Announce` action and phase, refusals, rematch and undo.
4. **Bots.** Announcement from hand strength; play to the announcement; an arena check.
5. **Server.** Wire format, lobby settings, fixtures.
6. **Frontend.** Score bar for individual variants, the announcement picker, i18n (de, fr, it, en, nl), layout checks.
7. **Docs.** A Differenzler page in `pages/docs/`.
8. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`; in `web/`
   `npm ci && npm run check && npm run lint && npm test && npm run build`, and commit the rebuilt `static/`.
9. **Pull request** `feat: play Differenzler Jass (US-222)`, `Closes #515`, rebased on fresh `main`, auto-merge (squash),
   subscribe to its activity and fix CI.
