# Plan: remove the compatibility paths (US-179)

One pull request, `refactor:` (no breaking change: no client in the repository uses the removed paths).

1. **Spec and plan** (this file and the design).
2. **Tests first**: the header-only stream tests, the one-stream test, the clients' test; they fail on the old server.
3. **`routes/events.rs`**: drop `token` and the snapshot branch; update the comment of `tables/stream.rs`.
4. **Checks**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`,
   `node --test crates/beelot-server/frontend-tests/*.cjs`.
5. **Backlog**: the story's "Delivered" paragraph, which says what is left.
