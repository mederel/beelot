# One table for a solo game (US-119) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The solo card table fits one screen (no scrolling at 360×640) as a new `table` view with toasts, a chip row and a round-result panel over the hand, while the old `bot-game` view stays behind a flag.

**Architecture:** Two pure scripts, `toast.js` (message queue) and `table-chips.js` (chip list from a board), are tested in Node. `router.js` maps `/play/bot/game/:id` to the view `table`; `app.js` swaps it for `bot-game` only under the legacy flag, and `loadTable` ports `loadBotGame` onto the `tbl-*` elements. Shared render helpers take the prefix or element they work on.

**Tech Stack:** Vanilla JS plain scripts, `node --test` with `.cjs` tests in `crates/beelot-server/frontend-tests/`, CSS in `styles.css`.

**Spec:** `docs/superpowers/specs/2026-11-07-solo-table-design.md`

## Global Constraints

- New view `data-view="table"`, inserted after `data-view="bot-game"`; IDs `tbl-card-table`, `tbl-player-top|left|right|bottom`, `tbl-current-trick`, `tbl-hand`, `tbl-chips`, `tbl-toasts`, `tbl-round-result`; seat prefix `tbl`.
- Legacy flag: `localStorage["beelot.legacy-table"] === "true"`; `?table=legacy` sets it, `?table=new` clears it; blocked storage means the new table. The old view and its code are not deleted in this story.
- The route and `tabOfView` entry stay as they are for play (`tab: null`, tab bar hidden); `routeFor("/play/bot/game/:id")` returns view `table`.
- The screen height is `calc(100dvh - var(--table-header-h))`, `overflow: hidden`; `--table-header-h` is the measured height of `#table-header`.
- Toasts: kinds `declaration` 2500 ms priority 1, `hint` 4000 ms priority 2, `detail` 6000 ms priority 3; one on screen, higher priority replaces, others queue (3 max, oldest dropped), same text ignored.
- Chips: declare toggle (`role="switch"`, `aria-checked`, on again each round) plus one chip per announcement; own before the first-trick reveal (`completedTricks === 1 && reviewingCompletedTrick`), everyone's after; tap shows the detail as a toast.
- The header (`#table-header`) is unchanged except the first menu line `Variant · Bots: Difficulty`; the help button waits for US-123.
- Hints, contract at seat, bot lines, second deal, trick collection, play again, leave confirmation, round review and hand-off keep working.
- No Rust, API, CSP or bidding-view change. New text: `aria-label` "Table messages" (FR and NL, flagged for native review).
- Tests: `node --test crates/beelot-server/frontend-tests/*.cjs`.

## Review Focus

- The table never scrolls at 360×640 in bidding-to-play, with a round result, long names and four chips (Tasks 4 and 7).
- The legacy flag brings back the old view unchanged, and the new view works without the flag (Tasks 3 and 5).
- Toasts never hide the cards and never lose a belote declaration (Tasks 1 and 6).
- Helpers that took `#bot-*` still work for the old view (Task 5).
- Celebrations, hints, the second deal and the round review work on the new table (Tasks 5 and 7).

---

### Task 1: `toast.js`

**Files:**
- Create: `crates/beelot-server/static/toast.js`, `crates/beelot-server/frontend-tests/toast.test.cjs`

**Interfaces:**
- Produces: `TOAST_MS`, `TOAST_PRIORITY`, `makeToaster({ show, hide, setTimer, clearTimer }) -> { push(text, kind), clear(), current() }`. `show(text, kind)` and `hide()` touch the DOM in `app.js`; `setTimer(fn, ms) -> id` and `clearTimer(id)` are injected.

- [ ] **Step 1: Write the failing tests** with fake `show`, `hide` and a manual timer list: the first `push` shows the text and starts its kind's duration; the same text again does nothing; ending the timer hides and shows the next waiting toast; a `hint` over a `declaration` replaces it at once and the replaced one is not shown again; a `declaration` over a `hint` queues; four waiting toasts keep the newest three; `clear` cancels the timer, empties the queue and hides; blank and whitespace-only text is ignored; `current()` returns the text and kind on screen or `null`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/toast.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `toast.js` with a guarded `module.exports`.
- [ ] **Step 4: Run** the test, then `node --test crates/beelot-server/frontend-tests/*.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: toast queue (US-119)`.

### Task 2: `table-chips.js`

**Files:**
- Create: `crates/beelot-server/static/table-chips.js`, `crates/beelot-server/frontend-tests/table-chips.test.cjs`

**Interfaces:**
- Consumes: the board fields read by `renderAnnouncements` in `app.js` (`ownAnnouncements`, `revealedAnnouncements`, `completedTricks`, `reviewingCompletedTrick`).
- Produces: `tableChips(board, label) -> { declare: { label } | null, chips: [{ id, text, scored, detail }] }`, where `label.own(announcements)`, `label.name(announcement)` and `label.detail(player, announcement)` are provided by the caller (translation stays in `app.js`).

- [ ] **Step 1: Write the failing tests** with a board literal and identity-style label functions: no announcements gives `declare: null` and no chips; own announcements before the reveal give a `declare` label and one chip per announcement with `scored: false`; at `completedTricks: 1` with `reviewingCompletedTrick` the chips become every revealed announcement with `scored` taken from its declaration; after the review ends (`reviewingCompletedTrick: false`, `completedTricks: 2`) the revealed chips stay; a new round (no own and no revealed) gives an empty list; chip ids are stable for the same board.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/table-chips.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `table-chips.js`.
- [ ] **Step 4: Run** the test, then all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: announcement chips (US-119)`.

### Task 3: Route the new view and the legacy flag

**Files:**
- Modify: `crates/beelot-server/static/router.js`, `crates/beelot-server/static/app.js`, `crates/beelot-server/frontend-tests/router.test.cjs`

**Interfaces:**
- Produces: `routeFor("/play/bot/game/:id")` returns `{ view: "table", tab: null, sheet: null, params: { id } }`; `legacyTable() -> boolean` and `applyTableFlag(search, storage)` in `app.js`; `viewForPath` returns `bot-game` for the play route only while `legacyTable()` is true.

- [ ] **Step 1: Write the failing tests.** Router: the play route returns view `table` with the id and tab `null`; `/play/bot/bidding/:id`, `/online/private/table/:id` and `/online/public/table/:id` are unchanged; `tabBarState(null)` still hides the bar.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/router.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** `router.js`: `["/play/bot/game/", "table"]` and `table: null` in `tabOfView`. `app.js`: read the flag from `localStorage` in a try/catch, apply `?table=legacy|new` once at load with `history.replaceState` removing the parameter, map `table` to `bot-game` while the flag is on, and add `"table"` to `scoreBarViews` and to the `tableView` test in `renderView` (header shared with bidding).
- [ ] **Step 4: Run** all frontend tests. Expected: all pass (the view `table` has no markup yet; Task 4 adds it, so keep the flag-less mapping at `bot-game` until then if a test needs the page to work).
- [ ] **Step 5: Commit** `feat: route the solo table to its own view (US-119)`.

### Task 4: Markup and layout

**Files:**
- Modify: `crates/beelot-server/static/index.html`, `crates/beelot-server/static/styles.css`, `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`
- Create: `crates/beelot-server/frontend-tests/solo-table.test.cjs`

**Interfaces:**
- Produces: `<section class="destination-view table-screen" data-view="table" hidden>` after the `bot-game` view with a visually hidden `<h1 id="tbl-title">`, `#tbl-card-table` (seats, `#tbl-current-trick` with its trick progress, `#tbl-hand`), `#tbl-chips` (`#tbl-declare` switch button and `#tbl-chip-list`), `#tbl-toasts` (`role="status"`, `aria-label="Table messages"`), `#tbl-round-result` (next round, rematch, results and review buttons as in `#round-result`); the difficulty line as the first child of `#table-menu`; `--table-header-h`.

- [ ] **Step 1: Write the failing tests** (`solo-table.test.cjs`, reading `index.html` and `app.js`): the view exists after `data-view="bot-game"` with every slot above; `#tbl-declare` is a `<button role="switch">`; the view has no `declare-option`, `announcements-panel`, `game-heading` or `type="checkbox"`; `toast.js` and `table-chips.js` load before `app.js`; the menu has the difficulty line element; "Table messages" is in `i18n.js` and `i18n-nl.js`; `styles.css` has `.table-screen` with `100dvh` and `overflow: hidden`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/solo-table.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the markup (copy the table, trick and hand structure of `bot-game`, drop the heading, hint line, declare checkbox, feedback block and announcements panel). CSS: `.table-screen` as a grid with rows `1fr auto auto`; compact seats under 700px of height; the chip row as a single scrolling line (`overflow-x: auto`, no wrap); `.toasts` positioned above the chip row with a short slide that Reduced and Off effects remove; `.table-screen .round-result` absolutely positioned over the hand zone with `max-height` and its own scroll only if its content needs it; `--table-header-h` set from a `ResizeObserver` on `#table-header` in `app.js` (a fallback of `7.5rem` in CSS). Add the two translations.
- [ ] **Step 4: Run** all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: markup and layout of the solo table (US-119)`.

### Task 5: Port `loadBotGame` to `loadTable`

**Files:**
- Modify: `crates/beelot-server/static/app.js`

**Interfaces:**
- Consumes: Tasks 1 to 4; `renderTrickDiamond`, `renderTableSeats(prefix, ...)`, `fillHand`, `playSecondDeal`, `offerHint`, `celebrateBelote`, `celebrateRound`, `celebrateMatchEnd`, `revealAfterTrick`, `showScoreBar`, `handOff`, `collectBotTrickLater`.
- Produces: `loadTable(gameId)`, called by `renderView` for the view `table`; the helpers above take the prefix or element they act on (default `bot` or the old IDs, so `loadBotGame` is unchanged).

- [ ] **Step 1: Write the failing tests** in `solo-table.test.cjs`: `renderView` calls `loadTable(` for the view `table` and `loadBotGame(` for `bot-game`; `loadTable` uses `"tbl"` as the seat prefix, `#tbl-hand`, `#tbl-current-trick` and `#tbl-round-result`; `playSecondDeal` and `fillHand` do not hard-code `#card-hand`; `loadBotGame` still exists.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** Give `playSecondDeal`, `playCard`, `collectBotTrickLater` and the reveal helpers an options argument (`{ prefix, hand, trick, result }`) whose default is the old selectors; write `loadTable` as `loadBotGame` aimed at the `tbl-*` elements, with the announcements, declare and declaration parts replaced in Task 6. Set the document title from `#tbl-title`; keep `leaveState`, the score bar and the hand-off calls as in `loadBotGame`. Errors still go to `/play/bot`.
- [ ] **Step 4: Run** all frontend tests, then start the server (`docker compose up -d --wait && cargo run -p beelot-server`) and play a solo game to its end in Chrome with and without `?table=legacy`. Expected: both work.
- [ ] **Step 5: Commit** `feat: play the solo game on the new table (US-119)`.

### Task 6: Toasts and the chip row

**Files:**
- Modify: `crates/beelot-server/static/app.js`, `crates/beelot-server/static/styles.css`, `crates/beelot-server/frontend-tests/solo-table.test.cjs`

**Interfaces:**
- Consumes: `makeToaster`, `tableChips`, `offerHint`, `declareChoice`.
- Produces: `tableToaster` (created once; `show` writes into `#tbl-toasts`, `hide` empties it); `renderChips(board)`; `declareChoice("tbl-")`-style reading of `#tbl-declare`'s `aria-checked`; hint reasons and declaration messages sent through `tableToaster.push`.

- [ ] **Step 1: Write the failing tests:** `app.js` creates the toaster with `makeToaster(`, clears it when `scoreBarGame` changes and on leaving the view, pushes the declaration message with kind `declaration`, the hint reason with kind `hint` and a tapped chip's detail with kind `detail`; `declareChoice` has a branch for the switch; the legacy path still reads the checkbox.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** `renderChips(board)` fills `#tbl-chip-list` and `#tbl-declare` from `tableChips` (label functions use `announcementName`, `playerName`, `cardName`); the switch toggles `aria-checked` on click and is set on again when it appears for a new round; chip taps push the detail; the declaration message (belote bonus text included) and the "X declares." note go through `tableToaster.push(..., "declaration")`; `offerHint` and `showHintReason` push the reason as `hint` when the target is the new table (the old `#hint-reason` stays for the old view); `setSuitText` is applied to the toast text as it is today for the declaration.
- [ ] **Step 4: Run** all frontend tests; in Chrome check a belote, an announcement reveal after the first trick, a hint and chip taps. Expected: pass; no layout shift.
- [ ] **Step 5: Commit** `feat: toasts and chips on the solo table (US-119)`.

### Task 7: Round result, menu line and browser checks

**Files:**
- Modify: `crates/beelot-server/static/app.js`, `crates/beelot-server/static/styles.css`, `README.md`, `docs/product-backlog.md`

**Interfaces:**
- Consumes: Tasks 4 to 6.
- Produces: the difficulty line in the table menu (`Variant · Bots: Difficulty`), set by `loadTable` and `loadBidding`; the delivered note under US-119; the README line on the legacy flag.

- [ ] **Step 1: Write the failing tests:** `app.js` sets the menu line from the variant and difficulty labels in `loadTable`; the README mentions `?table=legacy`; the backlog has a "Delivered:" note under US-119 naming the spec path.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** The menu line; the hand ignoring clicks while `#tbl-round-result` shows; the README sentence ("Open any page with `?table=legacy` to get the old solo table back, `?table=new` to leave it; the flag goes with the old view in a later story"); the backlog note (delivered, flag, what is deferred: the help button to US-123, the legacy view deletion).
- [ ] **Step 4: Browser checks** (Chrome; Safari listed as unverified), at 360×640, 390×844 and 1280×800: no vertical scroll in a whole solo game from the first card to the match end, including long names, four chips and the round result; toasts above the hand; chips and declare switch; hints, contract at seat, bot lines, the second deal, trick collection, play again, the leave confirmation, the round review and the celebrations; the difficulty in the menu; effects Reduced and Off; `?table=legacy` and `?table=new`. Record the results in the pull request.
- [ ] **Step 5: Gates:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `node --test crates/beelot-server/frontend-tests/*.cjs`.
- [ ] **Step 6: Commit** `feat: round result, menu line and docs for the solo table (US-119)`.

### Task 8: Pull request

- [ ] **Step 1:** `git fetch origin main:main` and rebase the branch on the fresh `main` (linear history).
- [ ] **Step 2:** Open the pull request titled `feat: one table for a solo game (US-119)` with the commands run, the browser results, the unverified Safari and the FR and NL texts flagged for native review.
