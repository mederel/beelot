# Plan: share a private table with a link that has a rich preview (US-212)

Design: `docs/superpowers/specs/2026-11-26-share-links-design.md`. Issue: #505.

1. **Spec and plan.** Commit the design and this plan.
2. **The handler.** `src/routes/invite.rs`: validate the code, pick the language, insert the tags into `index.html`; route
   `/join/{code}` in `routes/mod.rs`. Tests first: `tests/invite_preview.rs`.
3. **The image.** Draw `web/public/og-image.png` (1200×630) with Chromium; a web test checks its header and size.
4. **The page.** `/join/` in `routes.ts`, `inviteLinkUrl` in `small.ts`, the prefilled code in `Crew.svelte` and `App.svelte`,
   the lobby's "Copy link" and the link in "Share"; the French and Dutch texts. Unit tests.
5. **Docs.** `pages/docs/` (the page that lists the addresses the server answers) and the ideas page's status.
6. **Check.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` for the server's tests that do not
   need Docker; `npm run check && npm run lint && npm test && npm run build`, and commit the rebuilt `static/`.
7. **Pull request** `feat: share a private table with a link that has a rich preview`, `Closes #505`, auto-merge.
