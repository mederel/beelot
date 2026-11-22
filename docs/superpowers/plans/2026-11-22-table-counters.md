# Plan: count tables without scanning them (US-183)

One pull request, `perf:`. Each step leaves `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
`cargo test --workspace` green.

1. **Spec and plan** (this file and the design).
2. **Test** `the_counters_equal_a_scan_after_many_creations_and_removals` and the test-only scan `scanned_kind_counts`.
3. **Counters**: `tables/counts.rs`; the registry counts on insert and `Removal` uncounts on removal; `counts()` and
   `kind_counts()` read them.
4. **Documentation**: the story's `Delivered` paragraph in `docs/product-backlog.md`.
