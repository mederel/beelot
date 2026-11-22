# Design: save tables with fewer, cheaper writes (US-172)

## Goal

Every change of a table cost many statements: the table's row was upserted with its origin, the events were counted with
`SELECT COUNT(*)`, each event, token and link was one insert, and the tokens were deleted and inserted again. The writer's
queue was unbounded and one task wrote for every table, so one slow write held back all the others and the memory grew
behind a slow database. The restart read each table with three queries.

## Decisions

- **What the store knows is kept in memory.** `DbTableStore` holds, per table it has saved or read, the number of events
  saved, the tokens saved and the links saved. A change then sends only the difference:
  - the first change of a table (not known) upserts the row with its origin and counts the events once; the next ones only
    `UPDATE saved_table SET last_activity` (the origin, the largest value, is not sent again);
  - the events of a change go in multi-row `INSERT`s of at most 200 rows; the count is the one in memory;
  - the tokens are compared with the saved ones: the missing ones are deleted with one `DELETE ... IN (...)`, the new or
    changed ones go in one multi-row insert with `ON DUPLICATE KEY UPDATE`. When the saved tokens are not known (a table
    whose first change has no tokens, or after a failure) they are all replaced once;
  - a link goes out once (`INSERT IGNORE`), not with every change.
  The knowledge of a table is taken out of the cache when a write starts and put back only when it committed: a failed
  write leaves the next change to find out again what is saved, as before the story. `remove` forgets the table, `load_active`
  fills the cache from what it reads.
- **Known limit.** The cache assumes nothing else deletes a live table's rows. The retention purge deletes only tables idle
  beyond the retention (days), while a table with any change updates its `last_activity`; a table that sat idle that long in
  memory is closed long before (the idle expiry is hours), so the cache is not stale in practice. Not guarded further.
- **Pending changes of a table are merged.** A shard's task takes what is queued, merges the changes of each table that follow
  each other (`Change::absorb`: the events concatenate, an earlier start replaces the events from there as an undo does, the
  latest activity, tokens and links win, finished matches add up) and saves each table once. A removal ends the merging for
  its table. A change that would leave a hole is not merged, so the store sees it as it did.
- **The writer is sharded and bounded.** Eight tasks (`SHARDS`), each with a queue of 1,024 messages (`QUEUE`); a table goes
  to the shard of its id, so its changes stay in order. A slow write holds back only the tables of its shard, a full queue
  refuses the message, logs a warning and counts it (`Writer::refused`, the metric `beelot.tables.saves_refused`). A refused
  change leaves a hole that the store sees at the next change of the table (it does not save the table further until the
  restart), which is the safe outcome; the operator sees it in the count. `flush` waits for every shard. Making the shard
  count and the queue size configurable was left out: the constants are named, and no operator has asked.
- **The restart reads in a few queries.** One query lists the saved tables; the events, the tokens and the links are read
  with `WHERE table_id IN (...)` for up to 500 tables at a time, then grouped in memory. 100 tables take 4 queries instead of 301.
- **Spans.** `save`, `remove` and `load_active` run under `traces::db` as `tables.save`, `tables.remove` and
  `tables.load_active`; `db_spans.rs` checks them (they are trait methods, which its scan of public functions does not see).
  The bodies of `db/tables.rs` are formatted by rustfmt (no line over 100 characters, strings cut with a backslash).
- **Not changed.** The saved format and the schema; the persistence and golden tests pass unchanged.

## Figures

The test `tests/table_save_cost.rs` saves 1,000 changes spread over 100 tables (10 each: one event, two links, and four tokens
in the first change of each table) and counts the statements through MariaDB's `Questions` counter, then reads the 100 tables
back. CI prints the figures (a step after the coverage report runs it with `--nocapture`); this host cannot start the
MariaDB container, so the figures below come from CI's log of this pull request, not from a local run.

Before the story, by counting the statements of the old code for this workload: 5 per change (begin, upsert, count, insert,
commit) plus 2 links, plus for the first change of each table a delete and an insert per token (5): 7,000 + 500 = about 7,500
queries for the saves and 301 for the restart.

After (from CI): see the pull request.

The test asserts a bound that the old code exceeds (4 per change plus 8 per table: 4,800 queries) and 12 queries for the read.

## Tests

- Unit tests of `Change::absorb`, of the merging of a queue (a removal keeps two changes apart), a slow shard that holds back
  no other shard, and a full queue that refuses and counts instead of growing.
- `tests/table_saves.rs` (MariaDB): events saved in order and an earlier start replacing them; tokens as a difference
  (removed, changed, new, and a change of tokens alone); 30 saved tables read back exactly and saving going on from them;
  a removed table saved again.
- `tests/table_save_cost.rs` (MariaDB): the figures and their bounds.
- `tests/db_spans.rs`: the spans of the three trait methods.
- The persistence and golden tests are unchanged.
