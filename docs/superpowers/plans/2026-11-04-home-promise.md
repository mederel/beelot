# Say what Beelot is Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-line promise under the home title says what Beelot is and that it is free with no account.

**Architecture:** Change the `.intro` text and drop the home eyebrow in `index.html`; swap the dictionary entries in `i18n.js` and `i18n-nl.js`.

**Tech Stack:** Plain HTML and JavaScript dictionaries, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-home-promise-design.md`

## Global Constraints

- Text only: no new element, style or dependency. Texts through `t()` with FR and NL entries.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: say what Beelot is on the home page (US-103)`.

## Review Focus

- A leftover FR/NL entry for a deleted English string (dead translation).
- The longer sentence pushing the first mode card below the fold at 375×667.

---

### Task 1: Promise text

**Files:** Modify `static/index.html`, `static/i18n.js`, `static/i18n-nl.js`; Test `frontend-tests/home-promise.test.cjs`.

- [ ] **Step 1:** Write the tests from the spec (promise in `.intro`, mentions "account", no "remix", no home eyebrow, FR/NL entries, old strings gone).
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect the new tests to fail.
- [ ] **Step 3:** Edit the three files.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** In a browser at 375×667 check the first `.mode-card` top is under 667px.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
