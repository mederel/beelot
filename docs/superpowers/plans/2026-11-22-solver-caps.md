# Plan: cap the solver endpoints (US-173)

One pull request, `feat:` (a new code the player can see).

1. **Spec and plan** (this file and the design).
2. **Tests first**: `tests/solvers.rs`, the gate's, the error's and the route matcher's unit tests.
3. **Gate and limits**: `Limits::{solves_per_window, max_concurrent_solves}`, `SolverGate`, `AppState::solvers`, the fourth
   limiter in `RateLimits` and its middleware.
4. **Error and code**: `AppError::SolverBusy`, `msg::SOLVER_BUSY`; `UPDATE_MESSAGES=1` for the catalogue.
5. **Handlers**: permits in `hint` and `analysis`; the analysis cache on the table's handle; the views move to `api/analysis.rs`.
6. **Frontend**: the texts in `messages.ts` (English, French, Dutch), the recording in `message-texts-today.json`;
   `npm ci && npm run check && npm test && npm run build`, commit `static/`.
7. **Backlog** "Delivered" note.
8. **Checks**: fmt, clippy, workspace tests, the frontend's contract tests.
