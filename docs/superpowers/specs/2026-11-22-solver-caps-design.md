# Design: cap the solver endpoints (US-173)

## Goal

`GET /api/tables/{id}/hint` and `/analysis` each run a search that holds a core for up to several seconds. One client could ask
for them in a loop and slow every table. After this story the server runs a bounded number of them at once, counts them against
a stricter per-client limit, and computes the analysis of a round only once.

## Decisions

- **A gate on concurrent solves.** `limits::SolverGate` wraps a semaphore of `Limits::max_concurrent_solves` permits (by default
  half the cores, at least one: the other half is left to the bots). A handler takes a permit with `try_acquire`, never waits,
  and holds it until its search ends. With none left the answer is `AppError::SolverBusy`: 503 with `Retry-After: 5`, in the usual
  error body with the new code `solver-busy` ("Hints and analyses are busy. Please try again in a moment."). The code has its
  French and Dutch texts in `messages.ts`, and is in the message catalogue the frontend tests read. The frontend already shows
  the text of any code it knows, so no component changes; `static/` is rebuilt because the texts are part of it.
- **A stricter per-client limit.** `Limits::solves_per_window` (30 per rate window, against 300 for the general limit) counts the
  two routes in a fourth limiter of `RateLimits`, next to the general and the creation limits, in the same middleware, keyed by
  the same client key. Over it the answer is the usual 429.
- **The analysis is computed once.** The table's handle keeps the last analysis with the version of the table it was made at.
  A request for the same version returns it without taking a permit or computing: a finished round does not change, and any
  change of the table moves the version. The analysis views moved to `api/analysis.rs` so the handle can hold them. A cache hit
  still counts against the per-client limit (the limit is on requests, not on computing).
- **The solves and the bots do not fight.** Both run on tokio's blocking pool, which has up to 512 threads; the gate keeps the
  solves to a few of them, so they can neither fill the pool nor leave the bots without a thread. A separate pool was rejected as
  more machinery for the same effect. The CPU they share is what the gate's size (half the cores) protects.

## Tests (`tests/solvers.rs`, plus unit tests)

- With the limit set to one and its permit held, a hint and an analysis get 503 `solver-busy` with `Retry-After`, and succeed
  once the permit is released.
- With `solves_per_window` at 3, the fourth hint is 429 with `Retry-After`, the analysis shares the limit, a table read does not.
- The analysis of a finished round, asked again while every permit is taken, is answered with the same body; the handle knows
  it for the version and not for the next.
- With every permit held, a Challenging table still plays (the bots' search is not held by the solvers).
- Unit tests: the gate, the error's body, the routes counted as solves. The message catalogue and the frontend's code tests cover
  the texts.

## Left out

Waiting a short time for a permit instead of refusing at once; coalescing two simultaneous first requests for the same analysis
(both compute, the second answer replaces the first; the gate bounds the cost).
