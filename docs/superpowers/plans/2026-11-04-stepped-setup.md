# A step-by-step setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bot setup shows three short steps with Back/Next, a sticky action bar on phones and "what is this?" explanations.

**Architecture:** `#bot-game-form` gets `data-step`; each fieldset a `data-setup-step`; CSS shows the current group. A pure `static/setup-steps.js` clamps steps; `app.js` drives them and makes the submit handler advance until the last step.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-stepped-setup-design.md`

## Global Constraints

- No server change; every new text through `t()` with FR and NL entries.
- Choices are still saved (US-102) only when the game is dealt.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: a step-by-step bot game setup (US-105)`.

## Review Focus

- Enter pressed on step 1 or 2 advances, never deals.
- Reopening the setup always starts at step 1.
- Choosing Contrée on step 1 shows the Tout-atout option inside step 1; classic hides it.
- A choice made on step 1 survives going Back from step 3.

---

### Task 1: Step logic

**Files:** Create `static/setup-steps.js`; Test `frontend-tests/setup-steps.test.cjs`.

**Interfaces:** Produces `SETUP_STEPS = 3`, `moveSetupStep(step: number, delta: number, total = SETUP_STEPS): number` (clamped to 1..total).

- [ ] **Step 1:** Tests: `moveSetupStep(1, 1) === 2`, `(3, 1) === 3`, `(1, -1) === 1`, `(2, -1) === 1`.
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect failures.
- [ ] **Step 3:** Implement with the `module.exports` guard. **Step 4:** run; expect pass; commit.

### Task 2: Markup, wiring and styles

**Files:** Modify `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`; extend the test file.

- [ ] **Step 1:** Tests: form has `data-step="1"` and a `#setup-progress` `role="status"`; every fieldset carries `data-setup-step` 1–3 (variant+all-trumps 1, announcements+target 2, difficulty 3); two `<details>` explanations; a `#setup-back` button; the primary is `type="submit"` with id `setup-next`; script loaded before `app.js`; FR/NL entries for "Step {0} of {1}", "Next", "Back", "What is this?" and the two explanations.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement: markup; `showSetupStep(step)` (set `data-step`, progress text, Back visibility, primary label); submit handler advances while `setupStep < SETUP_STEPS`; reset to step 1 when the bot view opens; CSS for step visibility, sticky bar ≤ 760px, details, text-button Back.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** Browser at 375×667: step through 1→3 and back, check Enter on step 1 only advances, the bar is sticky, the title clears the edge, Contrée shows Tout-atout in step 1, then deal a game.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
