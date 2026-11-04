# Explain the score figures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round points read "+55 manche" (EN "round", NL "ronde") in the score bar.

**Architecture:** `roundPointsText(points, label, format)` in `static/score-bar.js`; `showScoreNumber` in `app.js` takes a text function; the tooltip and its translations go.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-05-score-labels-design.md`

## Global Constraints

- No server change; texts through `t()` with FR and NL entries.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: label the round points in the score bar (US-109)`.

## Review Focus

- No round in progress (`null`): nothing is shown, no stray label.
- The count-up shows the label while counting and screen readers do not hear partial numbers.
- The label fits a 360 px bar on two lines.

---

### Task 1: Label the round points

**Files:** Modify `static/score-bar.js`, `static/app.js`, `static/styles.css` (only if the chip needs it), `static/i18n.js`, `static/i18n-nl.js`; Test `frontend-tests/score-labels.test.cjs`.

**Interfaces:** Produces `roundPointsText(points: number | null, label: string, format: (n: number) => string): string`.

- [ ] **Step 1:** Tests: `roundPointsText(55, "manche", String) === "+55 manche"`, `(0, …) === "+0 manche"`, `(null, …) === ""`; `app.js` has no `round.title`; FR "round" → "manche", NL → "ronde"; "Round points" removed from both.
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect failures. **Step 3:** implement. **Step 4:** pass.
- [ ] **Step 5:** Browser at 360, 375 and desktop: label visible, chip not wider than the bar.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
