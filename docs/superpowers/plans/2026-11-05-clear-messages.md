# Messages that do not hide the cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the card-rejection reason to the status line, enlarge the turned card, name the suit on the accept button and explain "Pass".

**Architecture:** `passHelp` in `static/table-status.js`; `flashTableStatus` next to `setTableStatus` in `app.js`; `rejectCard` uses it when the hand has no `.hand-reason`; markup/CSS/i18n changes.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-05-clear-messages-design.md`

## Global Constraints

- No server change; texts through `t()` with FR and NL entries; the private table keeps its bubble.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: keep messages off the cards (US-107)`.

## Review Focus

- A flash is replaced by the next render, and the turn text returns after 3 s.
- Two rejected taps in a row restart the timer instead of stacking.
- Round 2 / Contrée: the accept button is hidden and nothing stale is left in it.
- The larger turned card does not push the hand or the dock off a 375×667 screen.

---

### Task 1: Pass help text

**Files:** Modify `static/table-status.js`; Test `frontend-tests/clear-messages.test.cjs`.

**Interfaces:** Produces `passHelp({ variant: "CLASSIC"|"CONTREE", round: number }): string` (an English key).

- [ ] **Step 1:** Tests: the three texts of the spec. **Step 2:** run `node --test crates/beelot-server/frontend-tests`; expect failures. **Step 3:** implement and export. **Step 4:** pass; commit.

### Task 2: Markup, wiring and styles

**Files:** Modify `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`; extend the test file.

- [ ] **Step 1:** Tests: no `id="card-hand-reason"` in the solo view; `#bid-help` exists and the pass button has `aria-describedby="bid-help"`; `.upturned-card` sets the larger card variables; FR/NL texts ("Take {0}" and the three pass texts).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement `flashTableStatus`, use it in `rejectCard` and restore it in `clearHandReasons`; name the suit on `#accept-upturned-button` and fill `#bid-help` in `loadBidding`; remove the solo bubble; CSS.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** Browser at 375×667: auction (suit named, Pass help, turned card large, dock fits), then a rejected card shows its reason in the status line and the turn text returns.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
