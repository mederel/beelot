# ADR-006: Tables as event-sourced state machines that survive a restart

- Status: Proposed
- Date: 2026-11-21
- Decision makers: Product and engineering
- Amends: ADR-001 (tables are no longer lost on a restart, and the "one mutex per table" model goes)

## Context

ADR-001 moved the backend to Rust with one in-memory `Table` model for solo, pass-and-play and online games, behind a
`std::sync::Mutex`, with Server-Sent Events carrying a snapshot of the whole table on every change. It listed "tables that
survive a restart" as a reason to revisit. Four things since then make that reason concrete:

- **Restarts are routine.** Every push to `main` is a release, and the apt package's hourly auto-update
  (`packaging/debian/beelot-auto-update`) restarts the service: 45 commits that were not documentation in the week to
  2026-11-21. Each restart drops every table in progress and every player token, for solo players too.
- **The table is a bag of optional fields.** `Table` has 29 fields (`tables/table.rs`). The phase is implied by which of
  `bidding`, `board`, `trick_shown`, `undo`, `round_recorded` and `rematch_votes` are set, so impossible combinations
  can be built. Its errors are the HTTP type `AppError` and its messages are English sentences.
- **The lock is held while bots think.** The Challenging bot searches up to 200 ms per decision inside the table's lock, so
  every read of a table (`GET`, hint, explanations, each SSE event of each subscriber) goes through `spawn_blocking`
  (20 call sites), and a panic poisons the lock, which #193 had to work around by evicting the table.
- **The client reconstructs what happened.** The server knows each call and card but sends only state;
  `game-events.js` diffs consecutive snapshots, and US-163 added a `moves` counter to estimate the moves a gap missed.

## Decision

Make the table a state machine whose changes are **events**, and keep those events.

1. **A pure crate, `beelot-table`**, between `beelot-game` and `beelot-server`: no I/O, no async, no HTTP types. It holds
   the lobby and seats, a `Phase` enum (`Lobby`, `Auction`, `Play`) in place of the optional fields, `Refusal` (a stable
   code, no text) in place of `AppError`, and the table's commands.
2. **Commands decide, events change.** `decide(&state, actor, command, now, entropy) -> Result<Vec<Event>, Refusal>`
   checks a command and, for the bots' turns, runs them; `apply(&mut state, &Event)` is the only code that changes the
   state and is deterministic. Bot decisions and each deal's seed are recorded in events, so replaying a log never runs a
   bot or draws a random number again (the Challenging bot's time budget makes it non-deterministic).
3. **One tokio task per table** (later step) owns its state, takes commands from a channel, publishes its state with a
   `watch`, and keeps its own deadlines (trick collection, bots filling a public table, the reconnect timeout, idle expiry)
   in place of the global 5-second sweep.
4. **The event log is saved in MariaDB** (later step): `table_event(table_id, seq, at, event)` and the hashes of the
   player tokens. At startup the server replays the tables active in the last 2 hours. A finished match is stored in the
   same transaction as its last move.
5. **SSE streams events** (later step): a `snapshot` when a stream opens, then one `event` per change with `id: seq`,
   filtered for the seat; the browser's `Last-Event-ID` on reconnect returns exactly the events it missed.
6. **Messages become codes** (later step): errors and auction lines are `{code, params}`, the dictionaries are keyed by
   code, and `message` stays in the responses for one release.

The steps are the user stories US-165 to US-171 of the backlog (Phase 19). Steps 1 and 2 (US-165 and US-166: the crate, then
the commands and events, with no change a player or a client can see) are specified in
`docs/superpowers/specs/2026-11-21-table-state-machine-design.md`; each later step gets its own spec and plan.

## Considered options

### Keep the mutex model and only persist snapshots

Serialize the whole `Table` on each change. Cheap to start, but it saves the 29 fields as they are, so the format is the
implementation: any field change breaks the saved tables, and bots' non-determinism is hidden in the blob. It also leaves
the lock, the snapshot diffing and the optional fields as they are.

### Persist nothing, and make restarts rare

Releasing less often does not fit how the project works (each merge is a release) and does not help the crash case.

### An actor per table without the event log

Fixes the lock and the sweep, not the lost tables. It is step 3 of this decision on its own, and stays possible if the log
is rejected.

### A game server in another language or a separate process

No: the rules crate is already pure Rust, and one binary is a property worth keeping (ADR-001).

## Consequences

- A deploy becomes a pause the client already handles (US-141, US-142, US-163 note the reconnect) instead of the loss of
  every game, and the "Resume your match" card (US-145), which today finds the table gone after a restart, keeps working.
- Guest names and table state are stored in the database for up to about 2 hours. This needs a retention rule, an update of
  the privacy policy (US-129) and of `docs/privacy/policy-review.md` before the log is saved (step 5). Events refer to seats;
  the link from a seat to an account is kept apart so that account deletion (US-081) scrubs it with one statement.
- About one row per move, some 450 rows for a 1,000-point match.
- Production deals are drawn from a 64-bit seed per deal instead of straight from the operating system's generator, so
  `SplitMix64` can reach 2^64 deals out of the 32! orders. For a card game that is enough; storing the shuffled deck in
  the event instead is the alternative (no limit, 32 bytes per deal, a small change in `beelot-game`).
- The event format needs no migration: logs live for hours, so an incompatible change drops the saved tables at startup,
  which is today's behaviour.
- A new crate, and a new place for rules of table flow that today live in `beelot-server`.
- The single instance stays; the log makes several instances possible later without choosing them now.

## Revisit when

Reassess if the log cannot be kept for privacy reasons (then keep steps 1 to 4), if write volume ever matters, or if
several server instances are needed (the log is the base, but the registry and the streams would then need a shared bus).
