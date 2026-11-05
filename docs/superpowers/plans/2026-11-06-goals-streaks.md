# Small goals and streaks (US-113) — implementation plan

Spec: `docs/superpowers/specs/2026-11-06-goals-streaks-design.md`. Written after the code, to follow the
repository rule that every user story has a spec and a plan.

### Task 1: Goal logic (`static/goals.js`, `frontend-tests/goals.test.cjs`)
- `goalSummary`, `goalMessage` (priority order), `goalCelebration`, `recordResult` (once per game signature, last
  20 kept), `loadLedger`/`saveLedger` (blocked or corrupt storage never throws), `ledgerFromStatistics`.

### Task 2: Texts and markup
- `index.html`: `#goal-line` on the home page, `#match-end-goal` on the screen, `goals.js` before `match-end.js`.
- French and Dutch texts in `i18n.js` and `i18n-nl.js`; styles for the goal line.

### Task 3: Wiring
- `app.js`: `loadGoals` with the account, `goalOutcome` when the match-end screen opens (celebration only when
  live), the signed-in statistics fetched again 1.5 s later.
- `match-end.js`: "First game!" / "First win!" sticker and the goal text.

### Task 4: Check and ship
- `cargo fmt --check`, frontend tests, scripted browser check at 390 × 844, PR with auto-merge (squash).
