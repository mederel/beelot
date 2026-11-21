# Table event stream: plan (US-168)

Design: `docs/superpowers/specs/2026-11-21-table-event-stream-design.md`.

1. `crates/beelot-server/src/tables/stream.rs`: `Moment`, `Recorder`, `messages()`.
2. `Published` carries the kept moments and the latest number; the task's `publish` records before it publishes.
3. `routes/events.rs`: `events=1`, `lastEventId`, `Last-Event-ID`; the old snapshot stream stays without `events=1`.
4. `tests/event_stream.rs` (Docker not needed).
5. `static/table-events.js`, wired in `index.html`, `app-core.js` (cursor, reopen with it), `app-announce.js` (announce events),
   and the solo/auction renderers announce by comparison only for solo tables. `frontend-tests/table-events.test.cjs`.
6. Backlog: a "Delivered" note on US-168.
7. `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`,
   `node --test crates/beelot-server/frontend-tests/*.cjs`.
