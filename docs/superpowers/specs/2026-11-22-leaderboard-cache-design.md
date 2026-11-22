# Design: make the leaderboard cheap (US-182)

## Goal

`GET /api/leaderboard` ran two or three queries per request: `top` (a join of `rating` and `account`, sorted) and, for a signed-in
player, `listed_above` (a count). With many players the same top was computed for every request, over every rating row of the variant
(the only index was the primary key `(account_id, variant)`). The contract of the endpoint does not change.

## Decisions

- **Index**: migration `0010_rating_board_index.sql` adds `rating_board_idx ON rating (variant, rating, matches)`.
  `listed_above` filters `variant = ? AND rating > ?` (a range on the index) and `matches >= ?` (read from the index, no row
  lookup). `top` filters on `variant` and `matches` and sorts by `rating DESC, matches DESC, display_name`: the index narrows it to
  the variant's rows, read in index order, and the account join supplies the name and the hidden flag. The last sort key is a column
  of another table, so a small sort over the variant's listed rows remains; it is bounded by `LIMIT 50` and, with the cache, runs once a
  minute per variant.
- **`EXPLAIN`**: the statements are constants (`ratings::TOP_SQL`, `LISTED_ABOVE_SQL`) used by the queries and by the test
  `both_queries_use_the_leaderboard_index`, which runs `EXPLAIN` on 300 rated players and asserts that `rating_board_idx` is the key
  used; the plans are printed in the test's output. They could not be run on the development host (the Docker bridge is blocked
  there); CI's run is their first.
- **Cache of the top**: `top_cache::TopCache` (generic, keyed by variant), lifetime `Limits::leaderboard_cache` (a minute by default;
  `Limits` is where the server's other durations are configured). The first request loads; concurrent first requests wait for that one
  load. Once the value is older than the lifetime, requests get the old value at once and one background task (guarded by a flag)
  renews it; if the renewal fails, the old value stays and a warning is logged. So the database is read once per lifetime however many
  players ask, and nobody waits for a refresh.
- **The player's own rank stays exact**: `of_variant`, `is_hidden` and `listed_above` are still read per request, not cached.
- **Hiding is immediate**: `PUT /api/leaderboard/visibility` invalidates both cached tops, so a player who hides does not stay on the
  board for a minute (it is a privacy choice). A rating change after a match shows within the lifetime, which the story accepts.
- **Time** is `tokio::time::Instant`, so the cache's tests run on paused time.

## Tests

- `top_cache.rs` (unit): 100 concurrent requests make one load and none for the rest of the lifetime; after the lifetime ten requests
  get the old value and cause one renewal; keys are independent and `invalidate` forces a reload; a failed first load is not kept.
- `tests/leaderboard.rs` (MariaDB): the `EXPLAIN` test above; and through the router, a second request returns the same top although a
  player was added in between, while the signed-in player's rank counts the new player.
- Not tested by a timing assertion: the cost itself. Before, every request ran the top query; now it runs once a minute per variant.
