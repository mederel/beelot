# Plan: find an account's tables without asking every table (US-184)

One pull request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Tests** for the index and for the messages `release_account` sends (with a test-only counter on the handle).
3. **Index**: `tables/accounts.rs`; `Summary.accounts`; the task sets it at spawn and on each published change; `Removal` clears it.
4. **`release_account`** reads the index instead of every handle.
5. **Documentation**: the story's `Delivered` paragraph in `docs/product-backlog.md`.
