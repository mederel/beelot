# Skip the setup by default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quick game and Play now start with the remembered (or default) choices; a Customise link opens the pre-filled setup form.

**Architecture:** `savedBotGame()` / `rememberBotGame(settings)` / `showBotGameInForm(settings)` in `app.js` around the `beelot.bot-game` `localStorage` key; the quick card becomes a button.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-quick-game-defaults-design.md`

## Global Constraints

- No server change; new text through `t()` with FR and NL entries; defaults documented in the README.
- Stacked on US-101 (`feat/play-now`); commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Corrupt JSON or an unknown value (e.g. target 700) in storage: defaults are used.
- Storage blocked (private mode): `getItem`/`setItem` throw; the game still starts with the defaults.
- Contrée remembered: the all-trumps fieldset visibility matches after pre-fill.

---

### Task 1: Remember and reuse the choices

**Files:** Modify `static/app.js`, `static/index.html`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`, `README.md`; Test `frontend-tests/play-now.test.cjs`.

**Interfaces:** Produces `savedBotGame(): GameSettings`, `rememberBotGame(settings): void`, `showBotGameInForm(settings): void`.

- [ ] **Step 1:** Write tests: `#quick-game` is a `<button class="mode-card …">`; a `Customise` link to `/play/bot`; the submit handler calls `rememberBotGame` before `startBotGame`; the form is filled from `savedBotGame()`; FR/NL "Customise".
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect failures.
- [ ] **Step 3:** Implement the three functions (validate each field, try/catch around storage); wire `#play-now` and `#quick-game` to `startBotGame(savedBotGame())`; fill the form before the Contrée-visibility `update()`; add `button.mode-card` reset CSS and the translations; README line.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** In a browser: customise (challenging, 500, announcements off), start, return home, press Quick game: a game starts with the same choices; `localStorage` holds them.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
