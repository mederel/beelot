# Confirm before leaving a table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leaving a table mid-match asks first and says what happens.

**Architecture:** `leaveConfirmation` (pure) in `static/leave-confirm.js`; a `<dialog id="leave-dialog">`; the global link handler in `app.js` opens it for links with `data-confirm-leave` when `leaveState` says a match is in progress.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-05-confirm-leave-design.md`

## Global Constraints

- No server change; texts through `t()` with FR and NL entries.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: confirm before leaving a table (US-110)`.

## Review Focus

- Escape and "Stay" keep the game and return focus to the menu button.
- A finished match, an unstarted online table and a ctrl/cmd-click leave without asking.
- The dialog does not break when opened twice (menu closed first).
- Browser back from the setup still works as before.

---

### Task 1: Confirmation model

**Files:** Create `static/leave-confirm.js`; Test `frontend-tests/confirm-leave.test.cjs`.

**Interfaces:** Produces `leaveConfirmation({ kind: "solo" | "online" | null, matchComplete: boolean }): { title: string, message: string } | null`.

- [ ] **Step 1:** Tests: solo in progress, online in progress, match complete → null, kind null → null. **Step 2:** run `node --test crates/beelot-server/frontend-tests`; expect failures. **Step 3:** implement. **Step 4:** pass; commit.

### Task 2: Dialog, wiring and styles

**Files:** Modify `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`; extend the test file.

- [ ] **Step 1:** Tests: the dialog markup, the two links' attribute, script before `app.js`, FR/NL texts.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement `leaveState` (solo loaders, online loader), the link-handler check, `askToLeave(destination)`, the dialog buttons; sticker styles.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** Browser: Stay, Escape, Leave, finished match, modified click.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
