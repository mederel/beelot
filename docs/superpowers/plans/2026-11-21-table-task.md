# Plan: a task and deadlines for each table (US-167)

Each item is a commit that leaves `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`,
`cargo test --workspace --locked` and `node --test crates/beelot-server/frontend-tests/*.cjs` green. One pull request,
`refactor:`, into `integration/event-sourced-tables`.

1. **Spec and plan** (this file and the design).
2. **Table accessors** in `beelot-table`: `hint_input` / `HintInput::solve`, `ReviewInput` with the explanation inputs,
   `next_deadline`, `tick`, and the reactions with their time. `Table::hint` and `explanations` keep their behaviour.
3. **The published read model** (`tables/published.rs`): `Published`, `Published::view(viewer, now)`, built from a `Table`.
4. **The task** (`tables/task.rs`) and the new `TableHandle` and `TableRegistry` (async methods, guard, outcome handler,
   shutdown). Routes, `matchmaking`, `friends`, `deletion`, `metrics`, `main`, `jobs` follow; the two sweep intervals go.
5. **Tests**: the registry, stream, job and route tests become async; new tests for blocking bots, panics, deadlines and
   shutdown.
6. **Documentation**: the backlog's "Delivered" note, ADR-006 status of step 3, README if a variable or workflow changed.
