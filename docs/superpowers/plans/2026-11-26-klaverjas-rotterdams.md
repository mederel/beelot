# Plan: play Klaverjas with the Rotterdam rules (US-214)

Design: `docs/superpowers/specs/2026-11-26-klaverjas-rotterdams-design.md`. Issue: #507. Depends on US-213 (#506): the code is
written only once its pull request is merged into `main` and this branch is rebased on it.

1. **Spec and plan.** Commit the design and this plan.
2. **Rule option in `beelot-game`.** `KlaverjasRules`, the legal-plays branch, tests first (same deal, different legal plays;
   forced trump; forced overtrump; undertrump rejected / allowed).
3. **Table and server.** The option in the table settings, persistence with an Amsterdams default, tests.
4. **Bots.** A test plays whole Rotterdams deals with bots and the legality check.
5. **Frontend.** The choice in the setup sheet and the lobby summary, i18n in `fr.ts`, `nl.ts` (and English), component test,
   screen in the layout checks if the sheet's layout changes; `npm run build` and the rebuilt `static/`.
6. **Docs.** The Klaverjas rules page in `pages/docs/`.
7. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and in `web/`
   `npm ci && npm run check && npm run lint && npm test && npm run build`.
8. **Pull request** `feat: play Klaverjas with the Rotterdam rules (US-214)`, `Closes #507`, auto-merge with squash, watch CI.
