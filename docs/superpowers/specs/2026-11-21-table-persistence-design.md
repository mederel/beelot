# Keep my game through a restart (US-169)

ADR-006 step 6. Builds on the table task (`2026-11-21-table-task-design.md`) and the event log
(`2026-11-21-table-state-machine-design.md`).

## Goal

A restart of the server for an update does not end a match: the tables active in the last two hours come back with their
ids, seats, tokens, invitation codes and scores.

## What is saved

A table is its `Origin` and its `Entry` log (ADR-006), so that is what is saved, plus the hashes of the tokens that act at
it. Four MariaDB tables (migration `0009_saved_tables.sql`):

| table | holds |
| --- | --- |
| `saved_table` | `table_id` (PK), `origin` (JSON), `format` (1), `last_activity` |
| `table_event` | `table_id`, `seq` (PK together), `version`, `at`, `event` (JSON), `ON DELETE CASCADE` from `saved_table` |
| `table_token` | `table_id`, `token_hash` (SHA-256, hex), `actor` (`seat:n`, `device` or `spectator`), `ON DELETE CASCADE` |
| `table_seat_link` | `table_id`, `link` (UUID), `account_id`, `ON DELETE CASCADE` from `saved_table` and from `account` |

A token itself is never saved, only its hash, as in memory.

### Privacy: events refer to seats, not accounts

The events and the origin hold no account id. Where the table has one (`Joined`, `AccountReleased`, the owner of the
origin's lobby), the saved JSON holds a random per-table `link` instead, and `table_seat_link` says which account a link
is. Deleting an account clears its links with one statement (`DELETE FROM table_seat_link WHERE account_id = ?`, also done
by the foreign key). A table restored after that has the seat with no account: a link without a row is an unknown account,
and the seat is cleared of it after the replay. Matches already finished are in the history, which the deletion already
anonymises.

## How it is saved

A `TableStore` (trait, `tables/store.rs`) is where a table's changes go: `save`, `remove`, `load_active` and `purge`. The
database one (`db/tables.rs`) is built from the pool; without one (every test but those of this story) nothing is saved.

A single writer task takes the changes from an unbounded channel in order, so the table's task never waits for the
database:

- The table's task sends a `Change` after each publish: the entries it has not sent (`from`), the table's last activity,
  its current tokens and, when the change finished a match, that match. A creation sends the origin and the first entries
  from `spawn`, before any token is issued, so the order is kept. `issue_token` sends a tokens-only change.
- The writer stores a change in one transaction: it checks that `from` is the number of events it already holds (fewer: a
  gap, logged and skipped; more: the extra are replaced), inserts the entries, rewrites the tokens and the links, and, for a
  finished match, stores it in the history in the same transaction (`HistoryRecorder::store_in`), which already keeps a
  match once under its id. With a store, the task takes the finished match out of the outcome, so the route does not record
  it a second time.
- A failed write is logged and the table goes on in memory, as the history does today.
- A table that ends (idle for two hours, left by its last player, removed, or closed by a panic) sends `remove`, which
  deletes its rows; a table that ends because the server stops does not. `shutdown` waits for the writer to drain.

## Restoring

At startup, after the migration, `TableRegistry::restore` loads the tables whose `last_activity` is within the idle expiry
(two hours), for each: reads the origin and the events, turns links back into accounts (links with no account stay as
unknown), and `Table::replay`s them with the registry's setup. A log that cannot be read (JSON of another format, an event
that no longer applies, a hole in the numbers) is deleted with a warning and the server goes on. Then:

- the seats of an online table are disconnected at the restart time (`Table::disconnect`), so a bot takes a seat over after
  the usual timeout from the restart, and a stream opening brings the player back;
- the tokens are put back with their actors, the invitation code is registered, and the task is spawned with the log it
  already holds marked as saved.

## Retention

Two hours after a table's last activity it is removed from memory, and with it its rows. The nightly job
(`privacy::retention`) also deletes saved tables whose `last_activity` is older than two hours, for the ones a crash left.
The policy says it in three languages: a new retention figure `tableHours: 2`, a line in "What we store" and one in "How
long we keep it"; the version is bumped, and `docs/privacy/policy-review.md` gets a row for it that stays **pending**: the
product owner chooses the wording and the retention.

## Export and deletion

The export (US-082) lists `savedTables`: the ids and last activity of the saved tables the account sits at (its category is
added to the policy). The deletion (US-081) deletes the account's links in its transaction.

## Tests (MariaDB)

- A table restored after a restart answers a stored token and shows the same snapshot (private table mid-auction, solo
  table, public table).
- A finished match is stored once, in the same transaction as its last move.
- Deleting an account clears its links, and the restored table has no account on that seat.
- A log of an unknown format is dropped and the others are restored.
- A table removed deletes its rows; one idle for two hours is purged by the retention job; a restored seat is disconnected
  and a bot takes it over after the timeout from the restart.
- The export and the deletion tests cover the new tables.

## Deviations to expect

- Events and origins are stored as JSON text, not a binary format.
- A change lost to a failed write leaves a gap in the log; a table restored from it is dropped like an unreadable log.
- Spectator tokens are saved with the others; their streams are not.
