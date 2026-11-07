# A home that shows where you are (US-122) Implementation Plan

**Goal:** Spec `docs/superpowers/specs/2026-11-07-home-status-design.md`.

**Architecture:** pure `home-status.js` (record helpers and `resumeCard`), home markup changes, account bar moved to
Settings, `tableSession` fallback, resume card filled when home renders.

## Review focus

`tableSession` fallback (never leaks a token to another table), record removal on completion, home height at 375×667.

## Tasks

- [x] 1. `home-status.js` and tests.
- [x] 2. Markup: resume card, goal line anchor, four cards, account bar into Settings.
- [x] 3. `app.js`: record on solo render, `tableSession` fallback, `loadResumeCard`, Play now handler without Quick game.
- [x] 4. CSS, texts, existing tests updated.
- [x] 5. Browser checks (mocked API), backlog note.

## Deviations found while implementing

- Stacked on US-121 (PR #67) because both touch `app.js` and `index.html`; rebase on main once it merges.
