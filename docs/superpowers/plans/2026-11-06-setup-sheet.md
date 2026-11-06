# One setup sheet (US-118) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One setup sheet over the Play tab replaces the bot setup view, the pass-and-play form and the create half of the private table form, with the wizard removed.

**Architecture:** A pure `setup-form.js` holds the defaults, per-mode memory, visible blocks and the create-table request. `router.js` makes `/play/bot`, `/play/local` and the new `/online/private/new` open the sheet over their tab's page; `sheet.js` reports why a sheet closed so the setup sheet replaces the URL only when the player dismissed it; `app.js` wires one `<dialog data-sheet id="setup-sheet">`.

**Tech Stack:** Vanilla JS plain scripts, `node --test` with `.cjs` tests in `crates/beelot-server/frontend-tests/`, CSS in `styles.css`.

**Spec:** `docs/superpowers/specs/2026-11-06-setup-sheet-design.md`

## Global Constraints

- Modes: `solo`, `pass`, `crew`. Routes: `/play/bot` (solo), `/play/local` (pass), `/online/private/new` (crew); the sheet is `routed: false` and the URL is its history entry. A player-dismissed sheet replaces the URL with `/` (solo, pass) or `/online/private` (crew).
- Switching mode keeps the variant, bots and rules values, swaps only the seat block (pass: four names; crew: owner name) and does `history.replaceState` to the mode's path, with no render.
- Crew creates `{ kind: "PRIVATE", playerName, variant }`; Bots and "More rules" are hidden in crew mode.
- Memory keys `beelot.setup.solo|pass|crew`; solo falls back to the legacy `beelot.bot-game`; seat names are never stored; "Play now" and "Quick game" use solo's memory.
- Defaults: `{ variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 }`; targets 500, 1000, 1500, 2000; tout-atout and sans-atout only for Contrée.
- "What is this?" stays an inline `<details>` (US-123 owns the help sheet). No Rust, API or CSP change.
- New texts (FR and NL, flagged for native review): "Set up your table", "Mode", "Solo", "Close", "More rules", "Players", "Bots", "Create a private table".
- Tests: `node --test crates/beelot-server/frontend-tests/*.cjs`.

## Review Focus

- A cold load of `/play/bot`, `/play/local` and `/online/private/new` opens the right mode (Task 3).
- Dismissing the sheet leaves the right URL and the back button does not leave a stale sheet over the next page (Tasks 2 and 3).
- Starting a game from the sheet works in every mode and the choices come back per mode after a reload (Tasks 1 and 3).
- No reference to a removed ID, view or wizard function survives (Task 4).
- "Play now" still uses the solo choices, including an old `beelot.bot-game` entry (Task 1).

---

### Task 1: `setup-form.js`

**Files:**
- Create: `crates/beelot-server/static/setup-form.js`, `crates/beelot-server/frontend-tests/setup-form.test.cjs`

**Interfaces:**
- Produces: `SETUP_MODES: string[]`, `DEFAULT_SETUP`, `loadSetup(storage, mode) -> setup`, `saveSetup(storage, mode, setup) -> void`, `setupBlocks(mode, variant) -> { seats, owner, bots, rules, allTrumps }`, `createRequest(mode, values) -> object`, `setupPath(mode) -> string`, `setupHome(mode) -> string`, `submitLabel(mode) -> string`. `values` is `{ variant, difficulty, announcements, allTrumps, target, seats?: string[4], playerName? }`.

- [ ] **Step 1: Write the failing tests** (`setup-form.test.cjs`, memory storage as in `account-offer.test.cjs`): `DEFAULT_SETUP` equals the Global Constraints value; `loadSetup` of an empty storage returns the defaults for every mode; save then load round-trips per mode and modes do not leak into each other; an invalid entry (bad variant, target 700, non-boolean announcements) returns the defaults; a partial entry is merged over the defaults; storage whose `getItem` and `setItem` throw never throws and loads the defaults; solo falls back to a legacy `beelot.bot-game` entry, and a saved `beelot.setup.solo` wins over it; an unknown mode loads the defaults. `setupBlocks`: solo/CLASSIC → `{seats:false, owner:false, bots:true, rules:true, allTrumps:false}`, solo/CONTREE `allTrumps:true`, pass → `seats:true`, crew → `owner:true, bots:false, rules:false, allTrumps:false` (also for CONTREE). `createRequest`: solo gives `kind: "LOCAL"` with the five fields and no `seats`; pass adds `seats` with `"  Ann "` → `"Ann"` and `""` → `null`; crew gives exactly `{ kind: "PRIVATE", playerName, variant }`. `setupPath`, `setupHome`, `submitLabel` for the three modes.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/setup-form.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `setup-form.js` with the exports above (guarded `module.exports`); validation mirrors the current `savedBotGame` (difficulty RELAXED/CHALLENGING, variant CLASSIC/CONTREE, boolean flags, target in 500/1000/1500/2000).
- [ ] **Step 4: Run** the same test, then `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: setup form logic (US-118)`.

### Task 2: Close reason in `sheet.js`

**Files:**
- Modify: `crates/beelot-server/static/sheet.js`
- Test: `crates/beelot-server/frontend-tests/sheet.test.cjs`

**Interfaces:**
- Consumes: `makeSheets` (US-116).
- Produces: `onClose(reason: "closed" | "ended")`: `"closed"` for `closeSheet`, Escape (close event), backdrop click and a drag; `"ended"` for `closeAll`, a sheet replaced by another and `handlePopState`.

- [ ] **Step 1: Write the failing tests** with an `onClose` that records its argument: `closeSheet` → `"closed"`; a dismissible sheet closed by the browser (`dialog.close()` then `flushClose()`) → `"closed"`; a backdrop click → `"closed"`; `closeAll` → `"ended"`; opening a second sheet over the first → first gets `"ended"`; `handlePopState` closing a dismissible routed sheet → `"ended"`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/sheet.test.cjs`. Expected: FAIL (reason undefined).
- [ ] **Step 3: Implement:** `finish(dialog, restoreFocus, entry, reason = "closed")` passes `reason` to `state.onClose`; `closeAll`, the replacement loop in `openSheet` and `handlePopState` pass `"ended"`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: sheets say why they closed (US-118)`.

### Task 3: Sheet routes, markup and wiring

**Files:**
- Modify: `crates/beelot-server/static/router.js`, `static/index.html`, `static/app.js`, `frontend-tests/router.test.cjs`, `frontend-tests/tab-bar.test.cjs`
- Create: `crates/beelot-server/frontend-tests/setup-sheet.test.cjs`

**Interfaces:**
- Consumes: `loadSetup`, `saveSetup`, `setupBlocks`, `createRequest`, `setupPath`, `setupHome`, `submitLabel` (Task 1); `onClose(reason)` (Task 2); `sheets`, `navigate`.
- Produces: `routeFor(path)` returns `sheet: "setup"` and `params.mode` for the three routes (views `home`, `home`, `private`; tabs `play`, `play`, `crew`); `/online/private/new` is a known route; the element `#setup-sheet` and its form `#setup-form`.

- [ ] **Step 1: Write the failing tests.** Router: the three routes return `{ view, tab, sheet: "setup", params: { mode } }` as above and are known routes; no other route has a sheet; `/play/bot` and `/play/local` no longer map to views `bot` and `local`; the tab test table is updated accordingly. Wiring (`setup-sheet.test.cjs`): `index.html` has `<dialog class="setup-sheet" data-sheet id="setup-sheet" aria-labelledby="setup-title">` with a `.sheet-grabber`, a form `#setup-form`, a mode group `name="setup-mode"` with values `solo`, `pass`, `crew`, a variant group `name="setup-variant"`, seat inputs `setup-north|east|south|west`, an owner input `setup-owner`, a bots group `name="setup-difficulty"`, `<details class="more-rules">` holding `name="setup-target"` (500, 1000, 1500, 2000), `name="setup-announcements"` and `name="setup-all-trumps"`, `#setup-message` with `role="alert"`, a submit button `#setup-submit` and a close button `#setup-close` with `aria-label="Close"`; no `data-view="bot"`, no `data-view="local"`, no `create-private-table-form`, no `local-` IDs; the private view has `<a class="button" href="/online/private/new">` "Create a private table"; `setup-form.js` loads before `app.js`; `app.js` calls `sheets.openSheet(` for `#setup-sheet` with `routed: false`, uses `createRequest(` and `loadSetup(` and no longer defines `savedBotGame`, `showSetupStep` or `showBotGameInForm`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** `router.js`: restructure the fixed routes so an entry can carry `sheet` and `mode`; add `/online/private/new` (view `private`, tab `crew`); drop `bot` and `local` from `tabOfView`. `index.html`: add the sheet dialog (markup as in spec section 5, chips as `.choice-group .choice`, "More rules" collapsed, the existing inline "What is this?" `<details>` kept under variant and announcements), replace the create form by the link, remove the `bot` and `local` views and the `setup-steps.js` script tag, add the `setup-form.js` tag before `app.js`, and fix the home slice markers that other tests use. `app.js`: `openSetupSheet(mode)` (load that mode's memory into the form, set the mode chip, show or hide blocks with `setupBlocks`, label the submit with `submitLabel`, open with `{ routed: false, onClose: (reason) => reason === "closed" && navigate(setupHome(mode), { replace: true }) }`, or only swap the block when already open); `renderView` opens the sheet when `routeFor(...).sheet === "setup"` and calls `sheets.closeAll()` when a route has no setup sheet while it is open; the mode chips call `history.replaceState({}, "", setupPath(mode))` and swap the block; the variant chips toggle the tout-atout row; the close button calls `sheets.closeSheet`; submit saves with `saveSetup`, builds `createRequest`, and starts the game (solo and pass: `api.createTable` then `navigate("/play/bot/bidding/" + id)`; crew: `enterPrivateTable(access)`), showing errors in `#setup-message`; "Play now" and "Quick game" call `startBotGame(loadSetup(window.localStorage, "solo"))`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass (update `play-now`, `tutorial-banner`, `home-promise` slices and assertions that read the wizard, and delete the wizard test in Task 4).
- [ ] **Step 5: Commit** `feat: one setup sheet for every mode (US-118)`.

### Task 4: Remove the dead code

**Files:**
- Delete: `crates/beelot-server/static/setup-steps.js`, `crates/beelot-server/frontend-tests/setup-steps.test.cjs`
- Modify: `crates/beelot-server/static/styles.css`, `frontend-tests/clean-headings.test.cjs`

- [ ] **Step 1: Write the failing test** in `setup-sheet.test.cjs`: `setup-steps.js` does not exist; `styles.css` and `app.js` contain none of `data-view="bot"`, `data-view="local"`, `setup-progress`, `setup-actions`, `local-seats`, `solo-all-trumps-settings`, `moveSetupStep`, `SETUP_STEPS`; the CSS defines `.setup-sheet`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement:** delete the two files; remove the CSS rules and media-query lines that mention the removed selectors (including the sticky `.setup-actions` and the `--tab-bar-height` rule for it) and any now-unused `.difficulty-form` rule after a search shows no remaining user; add the `.setup-sheet` rules (bottom sheet from the sheet component, compact rows, `More rules` summary at least 44px high, the seat names in two columns, the sheet scrolling inside itself when taller than the viewport); update `clean-headings.test.cjs`' selector list.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `refactor: remove the wizard and the old setup views (US-118)`.

### Task 5: Texts

**Files:**
- Modify: `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`
- Test: `crates/beelot-server/frontend-tests/setup-sheet.test.cjs`

- [ ] **Step 1: Write the failing test:** both locale files contain the eight new keys with these values (FR / NL): Set up your table (Préparez votre table / Maak je tafel klaar), Mode (Mode / Modus), Solo (Solo / Solo), Close (Fermer / Sluiten), More rules (Plus de règles / Meer regels), Players (Joueurs / Spelers), Bots (Bots / Bots), Create a private table (Créer une table privée / Maak een privétafel).
- [ ] **Step 2: Run** it. Expected: FAIL (the keys that already exist pass; the missing ones fail).
- [ ] **Step 3: Implement:** add only the missing keys, near their neighbours; do not duplicate an existing key.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: translate the setup sheet (US-118)`.

### Task 6: Browser checks, gates, backlog and pull request

**Files:**
- Modify: `docs/product-backlog.md` (a `- Delivered:` bullet on US-118 that names what moves to US-123)

- [ ] **Step 1: Browser checks** per the spec (Chrome, 375×667 and 1280px; server via `docker compose up -d --wait && cargo run -p beelot-server`): cold loads of the three routes, each mode starts a game, the sheet fits one screen with "More rules" collapsed, switching mode swaps only the seat block, per-mode memory after a reload, Escape, drag, close button and back button leave the right URL, "Play now" uses solo's choices, no console error beyond the known guest 401. Record what ran and what did not.
- [ ] **Step 2:** `node --test crates/beelot-server/frontend-tests/*.cjs`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (touch the Rust sources first if stale-path failures appear).
- [ ] **Step 3:** Commit the backlog bullet (`docs: mark US-118 delivered`), run one fresh whole-branch review, fix Important findings test-first, then push and open the PR `feat: one setup sheet (US-118)` based on `feat/tab-bar` (it stacks on #63) with the checks, unverified items and the decisions of spec section 3 in the body. Do not merge.
