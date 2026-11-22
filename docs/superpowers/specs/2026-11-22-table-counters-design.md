# Design: count tables without scanning them (US-183)

## Goal

`TableRegistry::counts()`, `kind_counts()` and the capacity check (`ensure_capacity`) walked the whole map of tables on every
call: creating a table, each metrics scrape and each status page cost O(tables). They now read three counters, one per kind.

## Decisions

- **`TableCounts`** (`tables/counts.rs`): three `AtomicUsize` (local, private, public), shared by `Arc` between the registry and
  each table's `Removal` guard. `Relaxed` ordering is enough: the counters are independent numbers and no other memory is
  published through them.
- **The counters follow the map, not the task.** A table is counted when `tables.insert` adds it (`insert` returned `None`) and
  uncounted when `Removal::remove` takes it out (`tables.remove` returned `Some`). Both are the only places that change the map,
  so the counters equal the map's content by construction, and "doing the removal twice does no harm" still holds: the second
  `remove` finds nothing and moves nothing. `Removal` runs from `Drop`, so a table that ends by an idle expiry, an empty seat
  list, a shutdown or a panic of its task (or of a bot's search) is uncounted too.
- **The kind is read from the removed handle**, not from the guard, so the guard gains only the `Arc<TableCounts>`.
- **Capacity check unchanged in meaning.** `ensure_capacity` calls `counts()`, now O(1). Making the check and the insertion one
  atomic step belongs to US-181 and is not done here.
- **Numbers unchanged.** `kind_counts()` keeps its order (local, private, public) and `counts()` keeps `(local, online)`, so the
  metrics (`beelot_tables`) and the status page give what they gave.

## Test

`registry_tests.rs` gains `the_counters_equal_a_scan_after_many_creations_and_removals`, with a test-only
`scanned_kind_counts()` that does the old walk. Thirty rounds create a local, a private and a public table and, every third
round, end one of each by a removal, by the last player leaving and by a panic inside the table; the counters are compared with
the scan after each step and after everything is removed. The behaviour is preserved, so this test passes on the old code too
(the old code is the scan); it fails if a counter drifts, which is the risk the change adds.

The cost is not asserted by a test (a timing assertion would be flaky): it goes from a walk of every entry to three atomic loads.
