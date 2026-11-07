# Help at the table (US-123) Implementation Plan

**Goal:** Spec `docs/superpowers/specs/2026-11-07-help-sheet-design.md`.

**Architecture:** `<dialog data-sheet id="help-sheet">`, content cloned from the hidden rules view, route sheet `help`
for `/rules`, menu and setup entry points.

## Review focus

Sheet replacement order with the setup sheet, the `/rules` close path, no duplicated rules text.

## Tasks

- [x] 1. Router: `/rules` → home, sheet `help`; tests.
- [x] 2. Markup: help sheet, menu Help button, setup note button, `#rules-card-order`.
- [x] 3. `openHelpSheet`, handlers, hint forwarding, route sheet handling in `renderView`.
- [x] 4. CSS, texts, tests, browser checks, backlog.

## Deviations found while implementing

- `/tutorial` stays a page; the tutorial table is not part of this story.
