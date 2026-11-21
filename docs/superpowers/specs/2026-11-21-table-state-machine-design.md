# Design: the table as a pure state machine with events (ADR-006, steps 1 and 2)

## Goal

Move the table's rules out of `beelot-server` into a pure crate, give the table an explicit phase, and make every accepted
change an event that a replay reproduces. **No player, client or API response changes.** This prepares the later steps of
ADR-006 (a task per table, events over SSE, a saved log, message codes); it ships nothing of them.

## Decisions

- **A new crate, `beelot-table`**, depending on `beelot-game`, `serde`, `thiserror`, `time` and `uuid`; no `axum`, `sqlx`,
  `tokio`, `anyhow` or `tracing`-based I/O. The workspace glob `crates/*` picks it up.
- **What moves (step 1):** `Lobby`, `Seat`, `Status`, `TableKind`, `Connection` (`tables/seats.rs`), `Table` and its setup
  (`tables/table.rs`), `Action`, `Reactions`, `Hint` and the finished-match types (`tables/finished.rs`, without the
  `MatchSink` trait, which is async and stays in the server). **What stays:** the registry, tokens, tickets, matchmaking,
  `codes`, `messages` (English text), `api/snapshot.rs`, the routes, `metrics` and `traces`.
- **`Refusal` replaces `AppError` inside the crate**: `Refusal { code: &'static str }` plus the few parameters a message needs
  (a suit, a count). The server maps it with `impl From<Refusal> for AppError`, looking the English text up by code in
  `tables/messages.rs`; the HTTP status, the code and the message of every response stay what they are. The two other
  errors the table raises today, `AppError::NotFound` (hints and reviews outside a local table) and
  `AppError::table_unauthorized()` (an actor that does not belong at the table), become `Refusal::NotFound` and
  `Refusal::NotSeated`, mapped back to the same statuses.
- **`Phase` replaces the optional fields:**

  ```rust
  enum Phase {
      Lobby,
      Auction { bidding: BiddingState },
      Play { bidding: BiddingState, board: GameBoard },
  }
  ```

  The auction stays beside the board because the snapshot shows it after the auction ends and the next dealer comes from it.
  The round being over, a trick shown, and the match being complete are read from the board and the score, as today, and
  not stored twice. The match's own state moves into one struct: `MatchState { score, id, rematch_votes, undos_used, undo,
  round_recorded }`, which exists only once a match started (`Option<MatchState>`, `None` in `Lobby`).
- **Undo** keeps its rule (a solo table, three per match, 8 seconds). The undo point is state that `apply` maintains from
  the events, so a replay reproduces it; the time window is checked by `decide` only.
- **Commands and events (step 2):**
  - `Action` is the command, unchanged on the wire (the same tagged JSON), now in `beelot-table`.
  - `Table::decide(&self, actor, action, now, entropy) -> Result<Vec<Event>, Refusal>` checks a command, plays the bots'
    turns that follow it and returns the events, without changing the table. `entropy` is what `decide` may not derive:
    the seeds of new deals and the ids of new auctions and matches. `TableSetup` becomes its source (the OS in production,
    seeded generators in tests).
  - `Table::apply_event(&mut self, &Event)` is the only code that changes the state. It is deterministic and never runs a
    bot or draws a random number.
  - The public `Table::apply(actor, action, now) -> Result<Outcome, Refusal>` stays as the two in sequence, so the registry
    and its tests do not change; `Table` keeps its log, `events()`, and `Table::replay(setup, events)` rebuilds a table.
- **The events** (one tagged enum, `serde`; the format is private and unversioned, since logs are short-lived):
  - lobby: `Joined { seat, name, account }`, `Left`, `SeatMoved { from, to }`, `ReadySet`, `SettingsChanged`,
    `SpectatorsSet`, `Started { fill_with_bots }`, `BotsFilled`, `Disconnected { seat, at }`, `Reconnected`,
    `BotTookOver { seat }`, `AccountReleased { account }`, `WatcherChanged { joined }`;
  - match: `MatchBegan { match_id, first_dealer, seed }`, `Dealt { dealer, seed, auction_id, from_pile }`,
    `Called { seat, decision }`, `CardPlayed { seat, card, declare }`, `TrickCollected`, `CardTakenBack`,
    `RematchAsked { seat }`, `Rematched { match_id, seed }`, `Reacted { seat, reaction, at }`, `Closed`.
  - A bot's turn is the same event as a human's (`Called`, `CardPlayed`), so a log replays without the strategy. The end of
    an auction, a redeal after four passes, a completed trick and the scoring of a round are derived by `apply_event` from
    the game crate's own state (`completed_board()`, `round_summary()`), as the table derives them today.
  - `at` is in the events that need a time (`Disconnected`, `Reacted`, a trick shown); the others use the time of the
    command that produced them, carried by `Table::apply`.
- **Seeds:** each deal gets one `i64` seed, from which `SplitMix64` shuffles and redeals; the first dealer is drawn from a second
  seed. Seeded tests keep the exact deals they have today (the seed formulas of `TableSetup::seeded` are kept).
  Production draws the seed from `getrandom`. This limits the reachable deals to 2^64 (ADR-006, Consequences).
- **Side outputs** (`Outcome`: the finished match, the daily result, `removed`) stay what `apply` returns; they are computed
  by `apply_event` into the table's pending outcome, as `pending` does today.

## What does not change

HTTP routes, JSON of requests and snapshots (`tests/contract/*.json` unchanged), English messages and their codes, the
statuses, the SSE stream, the registry's API, the database, the frontend, the metrics' names, and the behaviour of bots.

## Testing

| What | How |
|---|---|
| No behaviour change in step 1 | Every existing test passes without edits to its expectations: `tests/table_flow.rs`, `table_routes.rs`, `api_contract.rs`, `sse.rs`, `registry_tests.rs`, `seats_tests.rs`. Imports change; `beelot_server::tables` re-exports the moved names so most do not. |
| A golden run, recorded before step 2 | A new test plays scripted whole matches with seeded tables and the Relaxed bots, in each of: solo Classic, solo Contrée with all-trumps, pass-and-play, a private table of four humans, a public table filled with bots, a reconnect and a bot takeover, a solo undo, a rematch. After every action it serializes each seat's snapshot (the contract test's normalisation of the auction id) into `tests/golden/*.jsonl`. It is committed in step 1, **before** the events exist, and step 2 must leave the files byte-identical. |
| Replay | For each golden scenario, `Table::replay(setup, table.events())` gives, at every version, the same snapshot for every seat as the live table. Also with the log cut at each version. |
| Purity of `apply_event` | A test replays a log with a strategy that panics if called and an entropy source that panics if asked. |
| The crate stays pure | A test (or `cargo tree`-based check in the plan) that `beelot-table` depends on none of `axum`, `sqlx`, `tokio`. |
| Refusals | Each `Refusal` code maps to the same HTTP status, code and English message as the `AppError` it replaces (a table of the old messages, taken from the existing tests). |

The arena fixtures (`fixtures/`) record bot views, not table commands, so they stay with `beelot-game`; the golden run is what
pins the table.

## Risks

- **A large move.** The files to move (`table.rs`, `seats.rs`, `actions.rs`, `reactions.rs`, `hints.rs`, `finished.rs` and their tests) are about 2,600 lines. The plan moves them first with no edits to
  the logic, and changes the phase and the events in later commits, each with the tests green.
- **Derived transitions inside `apply_event`** hide rules; each is covered by the golden run and the replay test, which
  would diverge from the live table if a derivation read anything but the state.
- **Time.** A table's timers (`trick_shown`, disconnections) depend on `now`; the events carry it, and the replay test runs
  with a clock that is not the live one to prove it.
- **Seeds in production** (above): a decision for the product owner, recorded in ADR-006.

## Out of scope

The task per table, the deadlines, saving the log, streaming events, message codes and the frontend (the later steps of
ADR-006), and any change to the rules or the bots.
