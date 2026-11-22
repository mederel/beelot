# Plan: close the small gaps in the limits and comparisons (US-181)

One pull request, `fix:`.

1. **Spec and plan** (this file and the design).
2. **Tests first**: `equal` cases in `auth/csrf.rs`; parallel creations at the caps and the full command queue in
   `tables/registry_tests.rs`.
3. **`equal`**: hash both sides with SHA-256 and compare the digests.
4. **Caps**: `TableCounts::reserve` with an `online` gate, the `Place` guard, `TableRegistry::reserve` replacing
   `ensure_capacity`; restored tables use `added`.
5. **Queue**: `mpsc::channel(COMMAND_QUEUE)`, `send` refusing with `CapacityExceeded`, `send_always` for the destructors and `Stop`.
6. **Backlog** "Delivered" note.
7. **Checks**: fmt, clippy, workspace tests, the frontend contract tests.
