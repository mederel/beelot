# Design: a task and deadlines for each table (US-167, ADR-006 step 3)

## Goal

Replace the table's `Mutex`, the 5-second sweep and the minute-long eviction loop by **one tokio task per table**. The task owns
the `Table`, takes commands from a channel, publishes a read model after each change and keeps the table's own deadlines. A
read never waits for a bot's search, and a panic ends one table only. No route, JSON, stream or message changes: the golden
run (`crates/beelot-server/tests/golden`) and the contract files stay byte-identical.

## Decisions

- **The task owns the table.** `TableHandle` becomes a small handle: the table's id and kind, an unbounded command sender, a
  `watch::Receiver<Arc<Published>>`, and the state that is not the table's (tokens, stream tickets, open-stream counts, the
  time of the last read). The task is spawned by the registry when a table is inserted. Commands are `Act`, `Join`,
  `Reconnect`, `Disconnect`, `Watcher`, `ReleaseAccount` and `Ask` (a closure run on the table, for what is read rarely: the
  invitation, the spectator limits). The sender is unbounded because a stream that closes cannot await (`Drop`).
- **The published state is a read model, not the table.** `Table` cannot be cloned (`BiddingState` owns a boxed random source),
  and a `RwLock` would still be a lock. After every change the task builds `Published`:
  - the snapshot of each viewer that can exist (the device of a local table; the occupied seats and the spectator of an
    online one), **without reactions**, and the reactions with their send time. `snapshot()` reads `now` only for the
    reactions (kept 30 seconds), so a reader filters them by its own `now` and the JSON equals what the table would give;
  - a summary for matchmaking and the metrics (variant, status, seats taken, which seats are humans, `bot_fill_at`);
  - for a local table, the inputs of the hint and of the review: the mover's play or auction view (`Table::hint_input`, so
    that the search itself, `HintInput::solve`, runs later in the blocking pool and not on every move) and `ReviewInput`,
    which gains what `explanations` needs (variant and declarer). They are filled in only when they can be asked.
- **Reads touch no lock and no blocking pool.** The table route, the stream, the explanations and the hint's inputs come from
  `Published`. The Challenging bot's search and the solver of the analysis (and the hint's search) stay in `spawn_blocking`.
- **The bots' search runs off the task's thread.** For a command at a table where `needs_blocking_bot()` holds, the task moves
  the `Table` into `spawn_blocking` and takes it back from the result; the published state stays the previous one meanwhile,
  so every read answers. Other commands run inline (the Relaxed and Standard bots take microseconds).
- **Deadlines belong to the table.** `Table::next_deadline(reconnect_timeout, trick_review)` is the earliest of: the bot fill
  of a waiting public table (`bot_fill_at`), each disconnected seat's `since + reconnect_timeout`, and the shown trick's
  `shown_at + trick_review`. `Table::tick(now, ...)` runs what is due (what `sweep` did) and returns the outcomes. The task
  sleeps until the earliest deadline (a tokio timer of `deadline - clock.now()`, recomputed after every change and after every
  wake-up, so a wake-up that finds nothing due sleeps again), and until the idle expiry: the later of the table's own last
  activity and the handle's last read, plus `idle_expiry`. A trick is therefore collected exactly 4 seconds after it was shown.
  `jobs.rs` loses its two table loops, and `Limits` loses `matchmaking_sweep_interval` and `idle_sweep_interval`; the four
  durations that remain are configured as before.
- **Outcomes the task produces by itself** (a takeover or a collected trick can finish a match or a daily round) go to the same
  place as the outcomes of a request: the registry holds an outcome handler that `AppState` sets (it is `hand_over`).
- **A panic ends one table.** The task owns a guard whose `Drop` removes the table and its invitation code from the registry,
  so it runs on a panic of the task, of a blocking search (`JoinError`), and on a normal end (empty table, idle expiry,
  shutdown). The error is logged. Commands still in flight find the channel closed and answer as for a table that is not
  there (404 `NotFound`, as #193's eviction of a poisoned table did); the streams end.
- **No poisoned lock.** Tokens and tickets live in `DashMap`s, the stream counts in atomics, the last read in an atomic.
  `is_poisoned` and `PoisonError::into_inner` go.
- **Presence.** A stream's open and close are commands. The counts are incremented before `Reconnect` is sent; `Disconnect`
  is ignored by the task if a stream is open by then, which closes the race between a close and a reopen.
- **Quick matches** wait for each other on a `tokio::sync::Mutex`, held across the joins. The registry's methods that touched a
  table become `async` (they send a command and wait for its reply).
- **Shutdown.** The registry has a cancellation token and a task tracker; `registry.shutdown().await` cancels, waits for the
  tasks and `main` calls it after the server stops.
- **Tests with a paused clock.** The deadlines are tested under `#[tokio::test(start_paused = true)]` with the `FakeClock` and
  `tokio::time::advance` moving together (a test helper), because the task sleeps on tokio time and reads the `Clock`.

## What does not change

Routes and their answers, tokens, stream tickets, spectator limits, capacities (a full registry no longer evicts idle tables
on the way, since they remove themselves), the rules, the bots, the events, the metrics' names.

## Testing

| What | How |
|---|---|
| Golden run and contract | Untouched; `tests/table_golden.rs` drives `Table` directly. |
| A read answers while a bot thinks | A strategy that blocks on a barrier (leaked `&'static`): the table route, the hint and a stream answer meanwhile. Replaces `tests/blocking.rs`. |
| Deadlines | Paused clock: the trick at 4 s and not at 3.999 s, bots at 60 s, takeover at 120 s, idle expiry at 2 h (a read postpones it). |
| A panic | A strategy that panics: that table closes (404, code freed) and another table plays. Replaces the poisoned-lock test. |
| Shutdown | `registry.shutdown()` ends every task. |
| Outcomes | A finished match produced by the task reaches the sink. |
| Existing registry, route and stream tests | Same expectations, now `async`. |

## Out of scope

Saving tables, streaming events, message codes, several server instances.
