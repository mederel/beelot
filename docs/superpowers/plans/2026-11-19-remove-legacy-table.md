# Plan: remove the legacy table views (US-160)

1. Browser checks of US-119 to US-121 on a real server, before touching the code (solo, auction, online lobby and cards, pass and
   play).
2. `frontend-tests/legacy-removed.test.cjs` (fails on the old code: views, ids, helpers, flag cleanup, README, backlog).
3. `index.html`: delete the `bot-game`, `bidding` and `private-table` sections. `app-core.js`: `viewForPath`, the cleanup of the old
   entry, the stream and `renderView`; `app-solo-table.js`, `app-table-ui.js`, `app-auction.js`, `app-session.js`, `app.js`,
   `router.js`: delete what only served the old views.
4. `styles.css`: drop the dead selectors.
5. Fix the existing tests that sliced the page by the old views; delete those that only checked the flag.
6. README paragraph, backlog (Delivered notes and the US-119 to US-121 remarks).
7. Repeat the solo and online browser checks, then `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test --workspace`, `node --test crates/beelot-server/frontend-tests/*.cjs`.
