# Plan: save tables with fewer, cheaper writes (US-172)

One pull request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Tests first**: the unit tests of the writer in `tables/store.rs`, `tests/table_saves.rs`, `tests/table_save_cost.rs`,
   and the span check of the trait methods in `tests/db_spans.rs`.
3. **The writer** (`tables/store.rs`): shards with bounded queues, merging of the queued changes, the refused count and its
   metric (`metrics.rs`).
4. **The store** (`db/tables.rs`): the cache of what is saved, multi-row inserts, the tokens as a difference, the links once,
   the read with `IN (...)`, spans on the trait methods, formatted bodies.
5. **CI**: a step after the coverage report prints the figures of `table_save_cost`.
6. **Backlog**: the `Delivered` note with the figures from CI.
7. **Checks**: fmt, clippy, the tests that run here; the MariaDB tests run in CI.
