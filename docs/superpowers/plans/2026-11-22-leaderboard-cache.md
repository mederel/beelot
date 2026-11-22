# Plan: make the leaderboard cheap (US-182)

One pull request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Tests**: `top_cache` unit tests; `tests/leaderboard.rs` for `EXPLAIN` and the cached route.
3. **Index**: migration `0010_rating_board_index.sql`; the statements become constants.
4. **Cache**: `top_cache.rs`, `Limits::leaderboard_cache`, `AppState::leaderboards`, the route reads through it and the visibility
   change invalidates it.
5. **Documentation**: the story's `Delivered` paragraph in `docs/product-backlog.md`.
