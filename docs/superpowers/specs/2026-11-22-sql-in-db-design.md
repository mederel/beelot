# Design: every SQL statement in `db/` (US-187)

## Problem

Four modules wrote SQL themselves: `privacy/deletion.rs` (3 statements), `privacy/export.rs` (3), `privacy/retention.rs` (2)
and `routes/health.rs` (1). The schema was therefore read in two places, and those statements ran under no `beelot.db` span.

## Design

Each statement becomes a function of the module of its table, each under `traces::db`:

| Statement | Function |
|---|---|
| `UPDATE match_seat ...` (anonymize) | `db::matches::anonymize_seats(db, account, name)` |
| `DELETE FROM security_event WHERE account_id` | `db::events::delete_of_account` |
| `DELETE FROM account` | the existing `db::accounts::delete` |
| `SELECT MAX(occurred_at) ... 'EXPORT'` | `db::events::last_export` |
| `SELECT ... FROM security_event` (export) | `db::events::of_account`, returning `StoredEvent` |
| `SELECT created_at, last_used_at FROM passkey` | `db::passkeys::dates` |
| `DELETE FROM security_event WHERE occurred_at <` | `db::events::purge_before` (returns the count) |
| `SELECT id FROM account WHERE last_sign_in_at <=` | `db::accounts::inactive_since` |
| `SELECT 1` | `db::ping` |

The functions take `impl Executor`, so the deletion keeps its single transaction: it passes `&mut *transaction` to each of them.
They return times as `OffsetDateTime` (the conversion from the column's type stays in `db/`), so the export no longer
imports `PrimitiveDateTime`.

## The guard

`tests/sql_in_db.rs` walks `src/` and fails when a file outside `src/db/` contains `sqlx::query(`, `sqlx::query_as`,
`sqlx::query_scalar`, `sqlx::query_with` or `QueryBuilder`. (The log targets `"sqlx::query"` in `logs.rs` and
`telemetry.rs` are strings, not calls, and do not match.) The saved-table writer's statements are in `db/tables.rs`,
so there is no other exception.

## Tests

The behaviour is covered by the existing privacy, retention, health and persistence tests, which pass unchanged; the new test
is the grep. Before the change it fails with the four modules named (the patterns match 9 lines of `origin/main` outside `db/`).
