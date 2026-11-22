# Design: use the blocking pool only when a bot searches (US-185)

## Goal

A table's task moved its `Table` to the blocking pool (`spawn_blocking`) for every change whenever the table had a bot seat and
a strategy other than the Relaxed one (`needs_blocking_bot`): so a stream closing or a spectator coming or going at a Challenging
table paid for a thread hand-off and a move of the table, although neither can make a bot play.

## Decisions

- **`Work`** (`beelot-table`): the kinds of change a task asks of its table: `Act`, `Join`, `Reconnect`, `Disconnect`, `Watcher`,
  `Tick`, `ReleaseAccount`. `Work::can_make_a_bot_play` is true for `Act` (a move, a call), `Join` (the fourth player starts
  the match, and a bot may hold the first turn), `Tick` (a deadline: a bot takes a seat over, or a trick is collected and a
  bot plays) and `ReleaseAccount` (a bot plays the deleted account's seats). It is false for `Reconnect`, `Disconnect` and
  `Watcher`, which only emit an event: a bot takes a disconnected seat over at a deadline, which is a `Tick`.
- **`Table::may_search_for(work)`** is `work.can_make_a_bot_play() && needs_blocking_bot()`: the table says, for a command,
  whether it can make a Challenging bot search. `needs_blocking_bot` is unchanged.
- **The task** (`with_table`) takes the `Work` and runs the change in place unless `may_search_for` says it may search. The
  seven call sites name their work. Nothing else changes: the same changes run on the same table in the same order, only
  where they run differs, so the golden run is unchanged.
- **Observable**: `TableHandle::blocking_runs()` counts the hand-offs to the blocking pool (a relaxed atomic per table). The
  test reads it; the runtime's own blocking-thread metrics are unstable in tokio and would also count other users of the pool.

## Tests

- `table_flow.rs::only_the_work_that_can_make_a_bot_play_goes_to_the_blocking_pool`: for every `Work`, a Challenging table with
  bots says yes or no as above; a Relaxed table and a table with no bot seated say no to all.
- `blocking.rs::only_what_makes_a_bot_search_uses_the_blocking_pool`: at a Challenging solo table a stream closing and two
  watcher changes leave `blocking_runs` at 0; an action that makes the bots play raises it. Before the change the first part
  counted three hand-offs.
- Unchanged and passing: the golden run (`table_golden`), the existing `blocking.rs` tests (reads answer while a bot thinks,
  a panicking bot closes its table only).
