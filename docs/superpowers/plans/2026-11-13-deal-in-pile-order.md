# Plan: deal in pile order, then sort (US-140)

1. Server: `dealt` in `BiddingView` and `BoardView`; contract helper ignores it; a test for it.
2. `arrivalOrder` in `card-physics.js` with tests.
3. `sortHandAnimated` and the `sortedKeys`/`restyle` options of `dealCards`.
4. Opening deal (both table views) renders in deal order; second deal reorders, then sorts.
5. Wiring tests, spec, backlog note.
