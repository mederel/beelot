# Message codes instead of English sentences: implementation plan (US-170)

Design: `docs/superpowers/specs/2026-11-21-message-codes-design.md`.

1. **Record today.** `frontend-tests/fixtures/message-texts-today.json`: every English sentence of the server (the constants of
   `messages.rs`, the texts of the routes, the auction lines and calls with names, values and suits), rendered by the page as
   it was, in English, French and Dutch. Taken before any other change.
2. **The messages.** `Message` and `Coded` in `beelot_table::messages`; the constants become `Message`s with a code (one macro);
   the texts with parameters become functions; `catalogue()`; `Refusal` and `AppError` carry a `Message`.
3. **The wire.** `error.rs` bodies and the `error` event of the stream gain `code` and `params`; the snapshot gains
   `messageCode`, `callCode`, `declarationCode`; the `call` event of the stream gains `callCode`. The golden test leaves the
   new fields out of its hashes; the contract files and the spectator's key list gain them.
4. **The catalogue file and its tests** (`tests/message_codes.rs`, the module's own test).
5. **The page.** `i18n-messages.js` (generated from the catalogue and the recording for the fixed texts, written for the
   others); `renderMessage` and `localized` in `i18n.js`; the patterns and the replaced dictionary entries removed; the calls,
   the contract badge, the sound, the bots, the live region, the call bubbles and the Belote celebration read the codes; the
   sentences composed for the translator are built from codes; `index.html` lists the new module.
6. **The page's tests.** `message-codes.test.cjs`; the tests that fed English calls and declarations feed codes.
7. **Checks.** `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, the
   frontend `node --test`; in a browser at 375x667 and on a desktop width, in English, French and Dutch: the auction lines,
   the call bubbles and the history, a Belote and a Rebelote, and an error (a seat taken, an invalid code).
8. **Backlog.** The Delivered note of US-170.
