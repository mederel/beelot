# Plan: the table as a pure state machine with events (ADR-006, steps 1 and 2)

Each numbered item is a commit that leaves the four commands green (`cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `node --test crates/beelot-server/frontend-tests/*.cjs`).
Step 1 (items 1 to 6) and step 2 (items 7 to 12) are two pull requests, both titled `refactor:` since no player sees a
change. The product owner accepts ADR-006 (status Proposed today) before item 1; the sizes and the 64-bit seed of its
Consequences are the points to confirm.

## Step 1: the `beelot-table` crate

1. **The golden run.** `crates/beelot-server/tests/table_golden.rs` plays the scenarios of the spec (solo Classic, solo
   Contrée with all-trumps, pass-and-play, a private table of four humans, a public table filled with bots, a reconnect and a
   takeover, an undo, a rematch) with seeded tables and the Relaxed bots, and writes each seat's snapshot after each action to
   `tests/golden/<scenario>.jsonl` (`UPDATE_GOLDEN=1` rewrites, as `UPDATE_CONTRACT` does). Committed with the files it
   produced, on the current code.
2. **The crate.** `crates/beelot-table` with `Cargo.toml` (`beelot-game`, `serde`, `thiserror`, `time`, `uuid`), `lib.rs`,
   and `Cargo.lock` committed with it. The server depends on it. CI's `--locked` build passes.
3. **`Refusal`.** `beelot-table::Refusal` (code, parameters; `NotFound`, `NotSeated`) and, in the server,
   `impl From<Refusal> for AppError` with the English text found by code in `tables/messages.rs`. A test lists every code the
   old `AppError::conflict(..)` calls used and checks status, code and message against the old ones.
4. **Move the seats and the actions.** `seats.rs`, `actions.rs`, `reactions.rs`, `hints.rs` and the data types of `finished.rs`
   (not `MatchSink`) move with their tests; they return `Refusal`. `beelot_server::tables` re-exports them under the same
   names.
5. **Move `Table`.** `table.rs` moves; `crate::metrics::match_started` and `match_completed` calls become fields of the
   `Outcome` that the registry reports (`started`, `completed`), `CardView` is no longer imported (a hint carries a `Card`,
   and the server turns it into `CardView`). The registry and the routes change only where they named `AppError` of a table.
6. **Check the crate's purity.** A test of the server's workspace reads `cargo metadata` and fails if `beelot-table` depends on
   `axum`, `sqlx`, `tokio` or `anyhow`. The golden run, the contract files and every existing test pass untouched. Open the PR.

## Step 2: phase, commands and events

7. **`Phase` and `MatchState`.** Replace `bidding: Option`, `board: Option` and the loose match fields; the accessors
   (`bidding()`, `board()`, `match_score()`…) keep their signatures. The golden run does not move.
8. **`Event` and `apply_event`.** The enum, its serde, and `apply_event` for the lobby events first (join, leave, seat, ready,
   settings, spectators, presence, takeover), each moved out of the lobby method that does it today into `decide` (the check)
   and `apply_event` (the change).
9. **The match events.** `MatchBegan`, `Dealt`, `Called`, `CardPlayed`, `TrickCollected`, `CardTakenBack`, `Rematched`,
   `Reacted`, `AccountReleased`, with the bots' turns as `Called` and `CardPlayed`. `TableSetup` gives `decide` its entropy
   (seeds and ids); the formulas of `TableSetup::seeded` are unchanged so the golden deals stay.
10. **`Table::apply` is `decide` then `apply_event`.** `Table` keeps its `events()`. The side outputs are computed in
    `apply_event`. The golden files are byte-identical.
11. **`Table::replay`.** Tests: the replay equals the live table at every version for every scenario, also cut at each version;
    a replay with a panicking strategy and a panicking entropy source passes; a replay under another clock gives the same
    snapshots.
12. **Documentation.** README's developer section names the crate; the backlog gets the user stories of the later steps, each with its own spec and plan, written before its code. Open
    the PR.

## Not in this plan

A task per table and per-table deadlines (step 3), events over SSE (step 4), the saved log with its privacy rule and the
policy update (step 5), message codes (step 6) and ES modules for the frontend (step 7).
