# Keep my game through a restart: plan (US-169)

Design: `docs/superpowers/specs/2026-11-21-table-persistence-design.md`.

1. `beelot-table`: `Serialize`/`Deserialize` for `Lobby`, `Seat`, `SeatKind`, `Connection`, `Status`, `TableKind` and `Origin`;
   `Table::forget_accounts`.
2. Migration `0009_saved_tables.sql`.
3. `tables/store.rs`: `TableStore`, `Change`, the writer task, the pseudonymising of accounts (account to link and back).
4. `db/tables.rs`: the database `TableStore`; `HistoryRecorder::store_in` so a match goes into the same transaction.
5. Task and registry: `Change`s after each publish, tokens after `issue_token`, `remove` when a table ends but not at
   shutdown, `restore`, `shutdown` drains the writer.
6. `main.rs`: build the store, restore before listening. `AppState::with_table_store`.
7. Retention job, deletion and export.
8. Policy (en, fr, nl), `docs/privacy/policy-review.md`.
9. Tests with MariaDB: `tests/table_persistence.rs`; export and deletion tests.
10. Backlog "Delivered" note, README line on the new behaviour.
11. `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`,
    `node --test crates/beelot-server/frontend-tests/*.cjs`.
