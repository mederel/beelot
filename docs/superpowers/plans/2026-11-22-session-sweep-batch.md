# Plan: sweep expired sessions in a batch (US-186)

One pull request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Tests**: the 5,000-session statement count and the race between a request and the sweep.
3. **Batch**: `db::sessions::end_expired_batch` and `db::events::insert_many`; `sweep_expired` loops over batches.
4. **Documentation**: the story's `Delivered` paragraph in `docs/product-backlog.md`.
