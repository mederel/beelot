# Design: find an account's tables without asking every table (US-184)

## Goal

`TableRegistry::release_account` (deleting an account, and the nightly retention job through the same hand-over) cloned every
table's handle and sent each one a `ReleaseAccount` command, then waited for every reply: O(tables) messages for an account that
sits at none or one. It now asks only the tables where the account holds a seat.

## Decisions

- **`AccountTables`** (`tables/accounts.rs`): two `DashMap`s, account to the set of its tables, and table to the accounts last
  recorded for it. The second one lets a table's entry be diffed on each change and be removed whole when the table ends.
  An account with no table has no entry (no empty set is left behind).
- **The table's task keeps its own entry**, the same way `Removal` keeps the counters of US-183. The index is derived from what the
  task publishes: `Summary` gains `accounts` (the accounts at occupied seats, sorted, without duplicates), built in
  `Published::of` from the same predicate `release_account` uses (`seat.account`). The task calls `AccountTables::set` when it
  first publishes (spawn, which also covers restored tables) and every time a published version changes, which is every
  change of a seat: a join, a leave, a takeover, a release. Each command's reply is sent after the publication, so a player who
  has been told "you are seated" is already indexed.
- **`Removal` clears the table's entry**, so a table that ends by idle expiry, empty seats, shutdown or a panic leaves nothing
  behind (the same guard as the counters and the codes).
- **Lock order** is always the table's entry, then the account's, inside `set`; `clear` takes them one after the other. A table's
  entry is only written by its own task, so the two never run at once for one table.
- **`release_account` is unchanged in effect.** It reads `of(account)` and messages those tables; each task still checks the
  seats itself, so a stale entry only costs a useless message. The account row is already deleted when `release_account` runs (its sessions go by cascade), so it cannot take a new seat while the
  index is read.
- **No table scan remains** on this path. `handles()` is still used for the connected-players metric.

## Test

`registry_tests.rs`:

- `the_index_follows_seats_taken_and_left_and_tables_removed`: private table, a join, a leave, a solo table, removal of both;
  after each step `tables_of` equals the tables the account sits at, and no empty entry is left.
- `releasing_an_account_asks_only_the_tables_where_it_sits`: one table of the deleted account among 31 others; a test-only
  counter on the handle shows that none of the others is asked (before the change every one of them was). The existing
  `a_released_account_loses_its_seats_and_tokens_everywhere` and the privacy tests check that the effects are unchanged.

The cost is not asserted by timing; the counter of commands sent is the measure: 32 before, 1 after for that test.
