# Progress and Me tabs (US-124) Implementation Plan

**Goal:** Spec `docs/superpowers/specs/2026-11-07-progress-me-tabs-design.md`.

## Tasks

- [x] 1. `progress-tabs.js` (panel choice, open-table filter) and `code-boxes.js` with tests.
- [x] 2. Markup: switcher and panels, goal line, guest offer, six boxes, open tables, Find a game button, Me privacy link.
- [x] 3. `app.js`: switcher, goal line, code boxes, open tables list.
- [x] 4. CSS, texts, tests, mocked-API checks, backlog.

## Deviations found while implementing

- Recent matches do not open a recap: the API has no per-round detail (needs a server change).
