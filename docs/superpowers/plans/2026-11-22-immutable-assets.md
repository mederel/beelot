# Plan: make repeat page loads cheap (US-191)

One pull request, `perf:`.

1. **Measure the second load before** (Chromium, 375x667, throttled): 7 revalidations of the page's files.
2. **Spec and plan** (this file and the design).
3. **Tests first**: the Rust tests of the hashed names and the immutable header (`skeleton.rs`), the service worker test, the
   built-page tests.
4. **The build**: hashed names in `vite.config.ts`; the worker's cache-first rule for them (`build/sw-template.js`).
5. **The server**: the `immutable_assets` middleware in `app.rs`.
6. **The other readers of the names**: `limits.rs`, `skeleton.rs`, `test-container.sh`, ADR-007.
7. **Build** `static/`, **measure after**, **backlog** (Delivered).
8. **Checks**: fmt, clippy, the server's tests that need no database, `npm run check`, `lint`, `test`, `build`,
   `node --test frontend-tests/*.cjs`.
