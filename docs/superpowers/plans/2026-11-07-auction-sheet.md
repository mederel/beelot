# Auction in a sheet (US-120) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A solo auction is played on the `table` view with its choices in a bottom sheet (hand strip, one-line history, reasons for disabled choices); the old `bidding` view stays behind `?table=legacy`.

**Architecture:** A pure `auction-sheet.js` turns a `bidding` snapshot into the sheet's model, tested in Node. `router.js` adds `phase: "auction"` to the bidding route, which maps to the view `table`; `app.js` renders it with `renderAuction(gameId, ui)` (the old `loadBidding` generalised over `auctionScreens`), mirroring `renderSolo` from US-119.

**Tech Stack:** Vanilla JS plain scripts, `node --test` with `.cjs` tests in `crates/beelot-server/frontend-tests/`, CSS in `styles.css`.

**Spec:** `docs/superpowers/specs/2026-11-07-auction-sheet-design.md`

## Global Constraints

- `routeFor("/play/bot/bidding/:id")` returns `{ view: "table", tab: null, sheet: null, phase: "auction", params: { id } }`; every other route has `phase: null`. Under the legacy flag `viewForPath` returns `bidding` for it.
- The sheet is `<section class="auction-sheet" id="auction-sheet" role="region" aria-labelledby="auction-title">` inside `data-view="table"`, not a `<dialog>`; shown only in the phase `auction`; `max-height: 56dvh`.
- IDs: `auction-title`, `auction-history`, `auction-hand`, `auction-upturned`, `auction-values`, `auction-suits`, `auction-reason`, `auction-hint-reason`, `auction-pass`, `auction-bid`, `auction-take`, `auction-coinche`; radio groups named `auction-value` and `auction-suit`.
- `auctionSheet(bidding, { allTrumps, suit })` returns `{ mode, title, titleSuit, history, enabled, take, suits, values, pass, coinche, bid }` as in section 4 of the spec; reasons are English keys translated by `app.js`.
- Screens: `auctionScreens.legacy` (prefix `bidding`, old IDs) and `auctionScreens.table` (prefix `tbl`); `submitBid`, `playOpeningDeal`, `highlightHintBid` act on the screen in use; `reloadAuction` reloads it.
- New texts (FR and NL, native review flagged): "Your call", "Take {0}?", "Bid {0}", "Bid more than {0}", "No higher bid is possible: pass or coinche", "That suit was passed on the first round", "Waiting for {0}…", "Bidding so far".
- No Rust, API, CSP or private-table change; the old view is not edited beyond sharing helpers.
- Tests: `node --test crates/beelot-server/frontend-tests/*.cjs`.

## Review Focus

- No vertical scroll at 360×640 in Contrée (eight cards) and Classic, and the hand visible in the sheet (Tasks 3 and 7).
- The legacy flag restores the old auction unchanged (Tasks 2 and 4).
- The opening deal, bot calls on the seats, hints, hand-off and the move to the cards still work on the new screen (Task 4).
- Every disabled choice has a reason (Tasks 1 and 5).

---

### Task 1: `auction-sheet.js`

**Files:**
- Create: `crates/beelot-server/static/auction-sheet.js`, `crates/beelot-server/frontend-tests/auction-sheet.test.cjs`

**Interfaces:**
- Produces: `auctionSheet(bidding, options)` as in the spec; `BID_VALUES = [80, 90, ..., 160]`; `SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"]`.

- [ ] **Step 1: Write the failing tests** with snapshot literals (adapt `tests/contract/contree_bidding.json` and `classic_auction_round_2.json`): mode and title for Contrée, Classic round 1 and round 2; `titleSuit` is the upturned suit in round 1; history equals `auction`; values at or below `highestBid` disabled with reason "Bid more than {0}"; `highestBid` 160 disables every value and gives `bid.reason` "No higher bid is possible: pass or coinche"; the upturned suit disabled in round 2 with its reason; no-trumps and all-trumps present only with `allTrumps` and only in Contrée; `enabled: false` disables everything with "Waiting for {0}…" (the active player's name) and no per-value reason; `bid.value` is the lowest legal value; `bid.suit` keeps `options.suit` when legal, else the first legal suit; `coinche.shown` follows `coincheAllowed`; the input is not mutated.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/auction-sheet.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `auction-sheet.js` with a guarded `module.exports`.
- [ ] **Step 4: Run** the test, then all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: auction sheet model (US-120)`.

### Task 2: Route the auction onto the table

**Files:**
- Modify: `crates/beelot-server/static/router.js`, `crates/beelot-server/static/app.js`, `crates/beelot-server/frontend-tests/router.test.cjs`

**Interfaces:**
- Produces: `routeFor(...).phase`; `viewForPath` mapping the bidding route to `bidding` only under `legacyTable()`; `renderView` calling `loadAuction(id)` when the phase is `auction` on the view `table`, `loadTable(id)` otherwise.

- [ ] **Step 1: Write the failing tests** (router): the bidding route returns view `table`, tab `null`, `phase: "auction"`, `params.id`; the game route returns `phase: null`; fixed routes return `phase: null`; the private and public table routes are unchanged.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/router.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** `idRoutes` entries gain an optional phase (`["/play/bot/bidding/", "table", "auction"]`); `routeFor` returns it. In `app.js`, `viewForPath` maps `table` with phase `auction` to `bidding` under the flag; add a stub `loadAuction` that calls `loadBidding` until Task 4 so the page keeps working between commits.
- [ ] **Step 4: Run** all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: route the auction to the table view (US-120)`.

### Task 3: Sheet markup and layout

**Files:**
- Modify: `crates/beelot-server/static/index.html`, `crates/beelot-server/static/styles.css`, `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`
- Create: `crates/beelot-server/frontend-tests/auction-table.test.cjs`

**Interfaces:**
- Produces: the sheet section with the IDs and groups of the constraints, inside `data-view="table"` after the round-result panel; `<script src="/auction-sheet.js">` before `app.js`; sheet CSS (overlay at the bottom of the screen, grabber, history line, hand strip with small overlapping cards, value scroller, suit row, reason line, button row); the translations.

- [ ] **Step 1: Write the failing tests:** the sheet is inside the table view, is a `section` with `role="region"`, not a `dialog`; every ID exists; the radio groups are named `auction-value` and `auction-suit` and `auction-values` holds nine values; the sheet is `hidden` by default; `auction-sheet.js` loads before `app.js`; `styles.css` has `.auction-sheet` with `max-height: 56dvh`; every new text is in `i18n.js` and `i18n-nl.js`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/auction-table.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the markup (copy the choice-group and suit markup of the old dock under the new names), the CSS (hand strip card size from a custom property, value scroller as a horizontal `choice-group` with `overflow-x: auto`, `.auction-waiting-view` disabling the controls), and the eight translations.
- [ ] **Step 4: Run** all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: markup and layout of the auction sheet (US-120)`.

### Task 4: One renderer for both auction screens

**Files:**
- Modify: `crates/beelot-server/static/app.js`, `crates/beelot-server/frontend-tests/auction-table.test.cjs`

**Interfaces:**
- Consumes: Tasks 1 to 3; `renderSolo`'s `soloScreens` as the model.
- Produces: `auctionScreens`, `renderAuction(gameId, ui)`, `loadBidding` and `loadAuction` as thin wrappers, `reloadAuction`; `submitBid(action, body)`, `playOpeningDeal(game, bidding, humanIndex, ui)` and `highlightHintBid` taking the screen; the phase switching in `renderView` (sheet shown for `auction`, round-result and chips for the game).

- [ ] **Step 1: Write the failing tests:** `app.js` defines `auctionScreens` with prefixes `bidding` and `tbl`; `loadAuction` calls `renderAuction(gameId, auctionScreens.table)` and `loadBidding` the legacy one; `submitBid` reloads through `reloadAuction`; `playOpeningDeal` takes a `ui` and deals with `ui.prefix` and `ui.hand`; `highlightHintBid` resolves its target from the screen; the legacy screen still names `#pass-bid-button`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** Generalise `loadBidding` over `ui` (hand, upturned card, table, bottom seat, pass, take, bid, coinche, value and suit groups, hint reason, controls for the deal); on the new screen the felt keeps `#tbl-hand` as the target of the deal and `#auction-hand` shows the same cards; hide the sheet and show chips and result when the route is the game route, and clear toasts when the game changes. `submitBid` finds the waiting-class element and the human name through `ui`. Keep `contractFromAuction` for the badge. Errors go to `/play/bot` as today.
- [ ] **Step 4: Run** all frontend tests, then play a solo Classic and a Contrée auction in Chrome with and without `?table=legacy`. Expected: both complete and reach the cards.
- [ ] **Step 5: Commit** `feat: play the auction on the table (US-120)`.

### Task 5: Draw the sheet from the model

**Files:**
- Modify: `crates/beelot-server/static/app.js`, `crates/beelot-server/static/styles.css`, `crates/beelot-server/frontend-tests/auction-table.test.cjs`

**Interfaces:**
- Consumes: `auctionSheet`, `updateAmountChoices`, `offerAllTrumpChoices`, `passHelp`.
- Produces: `renderAuctionSheet(bidding, game)` filling the title, history, upturned card, hand strip, value scroller, suit row, buttons and reason line; handlers for the sheet's buttons (`auction-pass`, `auction-take`, `auction-bid`, `auction-coinche`, the round-2 suit buttons).

- [ ] **Step 1: Write the failing tests:** `renderAuctionSheet` uses `auctionSheet(`; it sets `disabled` and `aria-describedby` from `reason`; it hides `#auction-history` when the history is empty; the take button text uses "Take {0}"; the bid button uses "Bid {0}" with the value and the suit; the sheet's click handlers call `submitBid` with `pass`, `trump`, `contract` and `coinche`; no handler reads the old `contract-value` or `contract-suit` groups.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** Translate the reasons with `t` at render; keep the chosen suit in `options.suit` across redraws; the reason line shows the reason of the focused or selected choice, else the first applicable one; the hint reason goes to `#auction-hint-reason`; `setSuitText` for suit symbols.
- [ ] **Step 4: Run** all frontend tests; in Chrome check the history, the reasons, 160, round 2 and no-trumps. Expected: pass.
- [ ] **Step 5: Commit** `feat: draw the auction sheet from its model (US-120)`.

### Task 6: Hand-off, hints, new round, rematch, leave

**Files:**
- Modify: `crates/beelot-server/static/app.js`, `crates/beelot-server/frontend-tests/auction-table.test.cjs`

**Interfaces:**
- Consumes: `handOff`, `offerHint`, `leaveState`, the round buttons of US-119.

- [ ] **Step 1: Write the failing tests:** the auction render calls `handOff` and `offerHint("#table-hint-button", ...)`; `leaveState` is set for the auction; the next-round and rematch handlers navigate to the bidding route; the waiting class is set on the table view during a submitted call and removed after.
- [ ] **Step 2: Run** the test. Expected: FAIL (only for what Task 4 did not already cover).
- [ ] **Step 3: Implement** the missing wiring and fix whatever the browser check in Task 4 showed.
- [ ] **Step 4: Run** all frontend tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat: hand-off, hints and new rounds on the auction sheet (US-120)`.

### Task 7: Docs, browser checks and gates

**Files:**
- Modify: `README.md`, `docs/product-backlog.md`

- [ ] **Step 1: Write the failing tests:** the README says `?table=legacy` also brings back the old auction; the backlog has a "Delivered:" note under US-120 naming the spec path.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the README sentence and the backlog note (what shipped, the flag, deferred: online auction US-121, help US-123, deleting the old view).
- [ ] **Step 4: Browser checks** (Chrome; Safari listed as unverified) at 360×640, 390×844 and 1280×800 on a real server if available, else on the mocked API with the contract snapshots: the checks of section 8 of the spec. Record the results in the pull request.
- [ ] **Step 5: Gates:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (when Docker and crates are available), `node --test crates/beelot-server/frontend-tests/*.cjs`.
- [ ] **Step 6: Commit** `feat: docs for the auction sheet (US-120)`.

### Task 8: Pull request

- [ ] **Step 1:** `git fetch origin main:main`, rebase the branch on `main` (linear history).
- [ ] **Step 2:** Open the pull request titled `feat: auction in a sheet (US-120)` with the commands run, the browser results, what was not run, and the FR and NL texts flagged for native review.
