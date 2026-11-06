# Sheets and routes (US-116) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One router module and one sheet component under `crates/beelot-server/static/`, used by the leave dialog and the pass-and-play handoff, with no visible change for players.

**Architecture:** `router.js` holds the route table (`routeFor`) and a `makeNavigate` factory that owns every history push; `sheet.js` wraps a native `<dialog>` with focus return, drag-to-close, a history entry and a non-dismissible mode. Both are plain scripts with a `module.exports` guard, loaded from `index.html` before `app.js`.

**Tech Stack:** Vanilla JS (no bundler, no jsdom), `node --test` with `.cjs` tests in `crates/beelot-server/frontend-tests/`, CSS in `styles.css`.

**Spec:** `docs/superpowers/specs/2026-11-06-sheets-and-routes-design.md`

## Global Constraints

- Routes and their content do not change: `/`, `/index.html`, `/play/bot`, `/play/local`, `/online/private`, `/online/public`, `/stats`, `/settings`, `/privacy`, `/rules`, `/tutorial`, `/play/bot/game/:id`, `/play/bot/bidding/:id`, `/online/private/table/:id`, `/online/public/table/:id`.
- No new player-facing text, so no FR/NL change; the leave dialog keeps its texts.
- No Rust, API or CSP change; scripts are same-origin files (`csp.test.cjs` must still pass).
- Sheet drag closes at more than 30% of the sheet height or a release speed above 0.5 px/ms.
- Reduced and Off effects (US-094) skip the sheet slide animation; drag still works.
- The handoff sheet cannot be closed by `Escape`, backdrop, drag or the back button.
- Frontend tests run with `node --test crates/beelot-server/frontend-tests/` (CI does not run them; run them at every task).

## Review Focus

- Back button with a sheet open must close the sheet and leave the page where it was (Task 4).
- A second `Escape` on the handoff must not dismiss it (Chrome closes a dialog on a repeated `Escape`) (Task 3).
- Opening a sheet while another is open leaves exactly one open dialog and one history entry (Task 4).
- A link to an unknown same-origin path keeps behaving as a normal link (Task 2).
- A sheet whose opener left the DOM returns focus to `main`, not to `body` (Task 3).

---

### Task 1: `routeFor` and the route table

**Files:**
- Create: `crates/beelot-server/static/router.js`, `crates/beelot-server/frontend-tests/router.test.cjs`
- Modify: `crates/beelot-server/static/index.html` (script tag before `/app.js`), `crates/beelot-server/static/app.js:1-13,62-67` (remove `pathToView`, wrap `routeFor`)

**Interfaces:**
- Produces: `routeFor(pathname: string) -> { view: string, tab: null, sheet: null, params: { id?: string } }`; `isKnownRoute(pathname: string) -> boolean`. Exported through `module.exports = { routeFor, isKnownRoute }`.

- [ ] **Step 1: Write the failing tests** in `router.test.cjs`: `routeFor` returns the view of each fixed path (`/` and `/index.html` → `home`, `/play/bot` → `bot`, `/play/local` → `local`, `/online/private` → `private`, `/online/public` → `public`, `/tutorial`, `/rules`, `/settings`, `/stats`, `/privacy` → same name); `/play/bot/game/abc` → `{view: "bot-game", params: {id: "abc"}}`; `/play/bot/bidding/abc` → `bidding`; `/online/private/table/t1` and `/online/public/table/t1` → `private-table` with `params.id === "t1"`; an unknown path → `home`; `tab` and `sheet` are `null` everywhere; `isKnownRoute("/nope")` is false, `isKnownRoute("/stats")` true. Add a wiring test: `index.html` loads `/router.js` before `/app.js`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/router.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `router.js` with the table and prefix rules moved verbatim from `app.js`; in `app.js` delete `pathToView`, make `viewForPath(path)` return `routeFor(path).view`, and replace the three `.split("/").at(-1)` uses on game and table pages (`privateTableId`, `loadBotGame`/`loadBidding` calls in `renderView`, and the other `pathname.split("/").at(-1)` lines) with `routeFor(window.location.pathname).params.id`. Keep the link handler's `destination in pathToView` check as `isKnownRoute(destination)`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `refactor: move the route table into router.js (US-116)`.

### Task 2: `makeNavigate` and the `pushState` migration

**Files:**
- Modify: `crates/beelot-server/static/router.js`, `crates/beelot-server/static/app.js` (every `window.history.pushState`/`replaceState` call and the link handler near `askToLeave`)
- Test: `crates/beelot-server/frontend-tests/router.test.cjs`

**Interfaces:**
- Consumes: `isKnownRoute` (Task 1).
- Produces: `makeNavigate({ history, askToLeave, render }) -> navigate(path: string, options?: { replace?: boolean, confirmLeave?: boolean }) -> boolean`. It returns `false` and does nothing when `path` is not a known route; when `options.confirmLeave` is true and `askToLeave(path)` returns true it returns `true` without touching history; otherwise it calls `history.pushState({}, "", path)` (or `replaceState` when `replace`), then `render()`, and returns `true`. App code gets one instance named `navigate`.

- [ ] **Step 1: Write the failing tests** with fake `history` (records calls), `askToLeave` and `render`: pushes once and renders once for a known path; `replace: true` uses `replaceState`; an unknown path returns `false`, no history call, no render; `confirmLeave: true` with `askToLeave` returning true neither pushes nor renders; `confirmLeave: true` with it returning false pushes and renders; `confirmLeave` omitted never calls `askToLeave`.
- [ ] **Step 2: Run** the router test. Expected: FAIL (`makeNavigate` undefined).
- [ ] **Step 3: Implement** `makeNavigate` in `router.js`. In `app.js`, create `const navigate = makeNavigate({ history: window.history, askToLeave, render: renderView })` and replace the 12 `pushState` and 3 `replaceState` call sites plus their following `renderView()` (listed by `grep -n "pushState\|replaceState" static/app.js`). Paths with a dynamic id (`/play/bot/game/${id}`, `${basePath}/table/${tableId}`) are known routes through the prefix rules. The click handler becomes: skip when not same-origin or modified; `event.preventDefault()` only when `isKnownRoute(destination)`; then `navigate(destination, { confirmLeave: Boolean(link.dataset.confirmLeave) })`. The leave dialog's confirm button calls `navigate(destination)` after closing.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass. Then `grep -n "pushState\|replaceState" crates/beelot-server/static/app.js` must show none.
- [ ] **Step 5: Browser smoke** at `cargo run -p beelot-server` (Docker for MariaDB): home → bot setup → game → leave → home; deep-link `/play/bot/game/<id>` after reload; an `/unknown` link. Record what ran.
- [ ] **Step 6: Commit** `refactor: navigate through one function (US-116)`.

### Task 3: `sheet.js` core

**Files:**
- Create: `crates/beelot-server/static/sheet.js`, `crates/beelot-server/frontend-tests/sheet.test.cjs`
- Modify: `crates/beelot-server/static/index.html` (script tag before `/app.js`)

**Interfaces:**
- Produces: `dragOutcome({ distance: number, height: number, speed: number }) -> "close" | "back"` (close when `distance > 0.3 * height` or `speed > 0.5`); `makeSheets({ document, history }) -> { openSheet(dialog, { opener?, dismissible?, onClose? }), closeSheet(dialog), isOpen(dialog) }`. `dialog` is a `<dialog data-sheet>`; the factory takes `document` and `history` so tests pass fakes. History handling is added in Task 4; this task leaves the `history` parameter unused.

- [ ] **Step 1: Write the failing tests** on a small dialog fake (`showModal`, `close`, `addEventListener`, `dispatch`, `open`, `setAttribute`, `focus` spies): `dragOutcome` closes on distance 31 of 100, goes back on 29 of 100, closes on speed 0.6 with distance 1, goes back on speed 0.4; `openSheet` calls `showModal` and sets `aria-modal="true"`; `closeSheet` focuses the opener; with the opener removed from the document (`contains` false) it focuses `main`; a dismissible sheet closes on `cancel`; a non-dismissible one calls `preventDefault` on `cancel` and on a backdrop click, and when a `close` event arrives without `closeSheet` having been called it calls `showModal` again; opening a second sheet closes the first without focusing its opener; `onClose` runs once per close.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/sheet.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `sheet.js` with the exports above (`module.exports` guard; in the browser expose `window.sheets = makeSheets({ document, history: window.history })`). The backdrop click is a `click` whose target is the dialog itself. The grabber drag uses pointer events on `.sheet-grabber`, sets a `--sheet-drag` CSS variable, and decides with `dragOutcome`; with `body[data-effects]` of `reduced` or `off` it sets no transition.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add the sheet component (US-116)`.

### Task 4: sheet history entries

**Files:**
- Modify: `crates/beelot-server/static/sheet.js`, `crates/beelot-server/static/app.js` (`popstate` listener)
- Test: `crates/beelot-server/frontend-tests/sheet.test.cjs`

**Interfaces:**
- Consumes: `makeSheets` (Task 3).
- Produces: `openSheet` accepts `{ routed?: boolean }` (default `true`); a routed sheet calls `history.pushState({ sheet: id }, "")` on open, and `closeSheet` calls `history.back()` when the current history state is that entry. `sheets.handlePopState(event) -> boolean` returns `true` when it closed an open routed sheet (the caller then skips `renderView`), and for a non-dismissible routed sheet it re-pushes its entry, keeps it open and returns `true`.

- [ ] **Step 1: Write the failing tests** with a fake `history` (`pushState`, `back`, `state`): opening a routed sheet pushes one entry; `handlePopState` on a popstate with an open sheet closes it and returns `true`; with none open it returns `false`; closing by `closeSheet` while its entry is current calls `history.back()` once; opening a second sheet over the first leaves one open dialog and one entry; a non-dismissible sheet survives `handlePopState` and re-pushes; `routed: false` never touches history.
- [ ] **Step 2: Run** the sheet test. Expected: FAIL.
- [ ] **Step 3: Implement** the history bookkeeping in `sheet.js` (one owner for sheet entries); in `app.js` change the listener to `window.addEventListener("popstate", (event) => { if (!sheets.handlePopState(event)) renderView(); })`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: sheets close with the back button (US-116)`.

### Task 5: Sheet CSS and the leave dialog

**Files:**
- Modify: `crates/beelot-server/static/styles.css` (new `/* Sheets */` section near `.leave-dialog` at ~line 2335; remove `.leave-dialog` box rules, keep its inner layout), `crates/beelot-server/static/index.html:604-611` (`<dialog class="leave-dialog" data-sheet ...>` plus a `.sheet-grabber`), `crates/beelot-server/static/app.js` (`askToLeave`, the Stay and Leave buttons), `crates/beelot-server/frontend-tests/confirm-leave.test.cjs`

**Interfaces:**
- Consumes: `sheets.openSheet`, `sheets.closeSheet`, `navigate` (Tasks 2 to 4).
- Produces: the `.sheet` CSS contract used by Task 6: `dialog[data-sheet]`, `.sheet-grabber`, `dialog[data-sheet]::backdrop`.

- [ ] **Step 1: Update the failing test.** In `confirm-leave.test.cjs`, change the expected opening tag to `<dialog class="leave-dialog" data-sheet id="leave-dialog" aria-labelledby="leave-dialog-title" aria-describedby="leave-dialog-message">`, and add a test that `styles.css` contains `dialog[data-sheet]` and `.sheet-grabber`, and that `index.html` loads `/sheet.js` before `/app.js`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/confirm-leave.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** CSS: bottom-anchored panel on phones (`margin: auto auto 0`, full width, top radii `var(--radius-panel)`), centred with `max-width: 480px` from 1024px, backdrop `rgba(0,0,0,.55)`, grabber 2.5rem × .3rem pill, open/close transition removed under `body[data-effects="reduced"]` and `body[data-effects="off"]`; text colour `var(--card-ink)` on `var(--card-paper)` so contrast holds in every table theme. `askToLeave` calls `sheets.openSheet(dialog, { routed: false, opener: document.activeElement })`; Stay calls `sheets.closeSheet`; Leave closes then `navigate(destination)`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 5: Browser checks** (375×667 and 1280px; Reduced and Off): leave a solo table and Stay; leave and confirm; close by `Escape`, drag and backdrop; focus returns to the Leave link; contrast in Classic, Midnight and Sunset themes. Record what ran.
- [ ] **Step 6: Commit** `refactor: the leave dialog is a sheet (US-116)`.

### Task 6: Handoff sheet

**Files:**
- Modify: `crates/beelot-server/static/index.html:573-580`, `crates/beelot-server/static/app.js:1060-1082` (`handOff`), `crates/beelot-server/static/styles.css:1140-1153,2228-2243` (`.handoff`, `.handoff-card`)
- Test: `crates/beelot-server/frontend-tests/sheet.test.cjs` (wiring test)

**Interfaces:**
- Consumes: `sheets.openSheet(dialog, { dismissible: false, routed: false })`, `sheets.closeSheet`.
- Produces: `<dialog class="handoff" data-sheet id="handoff" aria-labelledby="handoff-title">`; `handOff(game, viewerName)` keeps its signature and promise.

- [ ] **Step 1: Write the failing wiring test.** `index.html` has `<dialog class="handoff" data-sheet id="handoff"` and no `<div class="handoff"`; `app.js` calls `openSheet` with `dismissible: false` in `handOff` and no longer toggles `cover.hidden`.
- [ ] **Step 2: Run** the sheet test. Expected: FAIL.
- [ ] **Step 3: Implement.** Turn the `div` into a `<dialog>` with the same inner card, drop `role` and `hidden`; `handOff` opens it with `{ dismissible: false, routed: false }` and `handoff-ready` calls `closeSheet` then resolves as today. Keep the handoff's full-cover look through its own CSS (the `.handoff` rules at 1140-1153 change from `position: fixed` overlay to the dialog's own box with `inset: 0; max-width: none; height: 100%`).
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 5: Browser checks** at `/play/local`, a pass-and-play match: the cover hides the hand; `Escape` (twice), a backdrop click, a drag and the back button do not dismiss it; "I'm ready" does; the next player's cover appears. Record what ran.
- [ ] **Step 6: Commit** `refactor: the pass-and-play handoff is a sheet (US-116)`.

### Task 7: Gates, docs and pull request

**Files:**
- Modify: `docs/product-backlog.md` (mark US-116 delivered the way earlier stories are marked, for example US-115)

- [ ] **Step 1:** Run `node --test crates/beelot-server/frontend-tests/`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (Docker for the MariaDB tests). All must pass; report any that could not run.
- [ ] **Step 2:** Browser matrix from the spec section 8 that is not yet recorded: every route from a cold load and from a link; back button in each flow; Safari (unverified if no Safari is available, say so in the PR).
- [ ] **Step 3:** Commit the backlog update `docs: mark US-116 delivered`.
- [ ] **Step 4:** Refresh `main` (`git fetch origin main:main`), rebase the branch on it, push, and open the PR titled `feat: sheets and routes (US-116)` with the spec and plan in the diff and the check results in the body.
