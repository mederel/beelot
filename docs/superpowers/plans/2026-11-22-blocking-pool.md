# Plan: use the blocking pool only when a bot searches (US-185)

One pull request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Tests**: `may_search_for` for each kind of work; the hand-off counter at a Challenging table.
3. **`Work` and `Table::may_search_for`** in `beelot-table`; the task's `with_table` takes the work; `TableHandle::blocking_runs`.
4. **Documentation**: the story's `Delivered` paragraph in `docs/product-backlog.md`.
