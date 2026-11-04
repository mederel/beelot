# A clear path for people new to belote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-time guests see a "New to Belote?" banner pointing to the tutorial; the tutorial card is second.

**Architecture:** A pure `static/tutorial-banner.js` (`TUTORIAL_SEEN_KEY`, `shouldShowTutorialBanner`, `tutorialSeen(storage)`, `markTutorialSeen(storage)`), loaded before `app.js`; `app.js` shows the banner from `loadAccount()` and marks it seen on dismiss and on finishing the tutorial.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-tutorial-banner-design.md`

## Global Constraints

- No server change; new text through `t()` with FR and NL entries; Node-loadable module via `if (typeof module !== "undefined")`.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: point newcomers to the tutorial (US-104)`.

## Review Focus

- Storage throws (private mode): no crash, banner treated as unseen.
- Signed-in visitor: banner never shown, even if unseen.
- `/api/account` fails: banner shows for an unseen guest rather than staying hidden.
- Tutorial finished on the last lesson: banner gone on the next visit.

---

### Task 1: Banner logic

**Files:** Create `static/tutorial-banner.js`; Test `frontend-tests/tutorial-banner.test.cjs`.

**Interfaces:** Produces `shouldShowTutorialBanner({ seen: boolean, signedIn: boolean }): boolean`, `tutorialSeen(storage): boolean`, `markTutorialSeen(storage): void`, `TUTORIAL_SEEN_KEY = "beelot.tutorial-seen"`.

- [ ] **Step 1:** Tests: show only for `{seen:false, signedIn:false}`; `tutorialSeen` reads `"true"`; `markTutorialSeen` writes it; both survive a storage whose methods throw (seen false).
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect failures.
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Run the Node tests; expect pass. Commit.

### Task 2: Banner, card order and wiring

**Files:** Modify `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`, `README.md`; extend the test file.

- [ ] **Step 1:** Tests: `<aside id="tutorial-banner" … aria-labelledby>` precedes `.mode-grid`; `/tutorial` is the second `.mode-card`, titled "Learn the basics"; script loaded before `app.js`; FR/NL entries for the banner texts and "Learn the basics".
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Add the banner and move/rename the card; `updateTutorialBanner(signedIn)` called from `loadAccount()` (also on failure); dismiss and "Finish tutorial" call `markTutorialSeen(window.localStorage)` and hide the banner; sticker CSS; translations.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** Browser: banner shows on a clean profile, Start opens the tutorial, Dismiss hides it and it stays hidden after reload.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
