# Plan: play Coiffeur Jass (US-221)

Design: `docs/superpowers/specs/2026-11-26-coiffeur-jass-design.md`. Issue: #514. Depends on US-220 (#513, Schieber).

**Gate.** Steps 2 to 7 start only once US-220's pull request is merged into `main`: `git fetch origin main`, rebase this
branch on it and resolve the design's role names (Schieber's deck, trick order, locales) to the merged code. Nothing of
US-220 is duplicated here.

1. **Spec and plan.** Commit the design and this plan.
2. **Contract engine** (`beelot-game`): `Variant::Coiffeur`, `Contract`, factors, `Slate`, scoring and the per-trick order
   for Slalom and Gustav, tests first (Pagat's examples, match, jokers, order of play).
3. **Table rules** (`beelot-table`): the choice (with pass, barrel and full-column passes), the slate in the session state,
   twenty deals and the end of session, undo and rematch, the snapshot; server DTOs.
4. **Bots**: the contract choice and the pass rule; a seeded full-session test; fixtures for Slalom and Gustav.
5. **Slate UI**: the slate, the contract picker, the totals; `de`, `fr`, `it`, `en`, `nl` texts; layout checks at 375×667
   and with the German texts; `npm run build` and the rebuilt `static/`.
6. **Docs**: `pages/docs/` rules page for Coiffeur (the source, the factors chosen, what is out of scope), and the README's
   list of games if it has one.
7. **Check**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and
   `npm ci && npm run check && npm run lint && npm test && npm run build`; report what ran.
8. **Pull request** `feat: play Coiffeur Jass with a score slate (US-221)`, `Closes #514`, auto-merge (squash), watch CI.
