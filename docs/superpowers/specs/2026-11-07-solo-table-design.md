# US-119 — One table for a solo game: design

Status: proposed (decisions taken by the implementer, see section 3). Story: `docs/product-backlog.md`, Phase 8.
Context: sections 5.3 and 7 of `2026-11-06-ui-refactor-wireframes-design.md`. Builds on US-116 (sheets, router),
US-117 (tab bar) and US-118 (setup sheet).

## 1. Goal

The solo card table fits one screen and never scrolls: at 360×640 the header, the four seats, the current trick, one
row of chips and the whole hand are visible together. One new table template replaces the `bot-game` view; the old
view stays behind a flag until the new one passes the browser checks. The bidding view is untouched (US-120).

## 2. Today

- `data-view="bot-game"` (`index.html`) stacks a game heading (eyebrow, title, difficulty summary), the card table,
  a hint line, a declare checkbox, a feedback block (declaration message, declarers note), an announcements panel and
  the round-result panel. On a phone these add up to more than one screen, so the player scrolls to reach them.
- The header (`#table-header`: score bar and `#table-bar` with the menu, the status line) is shared by bidding and
  play and is kept as it is. The header's help button waits for the help sheet (US-123).
- `loadBotGame` in `app.js` fills the view: score bar, declaration message, announcements, trick diamond, round
  result, seats (`renderTableSeats("bot", ...)`), bot expressions, hand, second deal, hint, hand-off.
- The `#bot-*` IDs, `#card-hand`, `#current-trick`, `#declare-*` and `#announcements-*` are used by that function only,
  by `celebrate*` and by the tests listed in section 8.
- `/play/bot/game/:id` is the route; `routeFor` maps it to the view `bot-game`.

## 3. Decisions

1. **A new view `data-view="table"` with a `tbl-*` ID family.** It is a single template that US-121 will reuse for
   online and pass and play, so its IDs carry no mode (`tbl-card-table`, `tbl-player-top|left|right|bottom`,
   `tbl-current-trick`, `tbl-hand`, `tbl-chips`, `tbl-toasts`, `tbl-round-result`). It is inserted after the
   `bot-game` view in `index.html`, so tests that slice the page at that view keep working.
2. **The route is unchanged; the view is the flag.** `routeFor("/play/bot/game/:id")` returns the view `table`
   (tab `null`, as today). `viewForPath` in `app.js` swaps it for `bot-game` while the legacy flag is on. The flag is
   `localStorage["beelot.legacy-table"] === "true"`; opening any page with `?table=legacy` sets it and `?table=new`
   clears it. Blocked storage means the new table. The old view and its code are deleted by the story that retires
   the flag (recorded in the backlog), once the browser checks of section 8 pass on both screen sizes.
3. **The felt fills the viewport under the header.** On a phone at least 640px high the shell is `100dvh` with
   `overflow: hidden` and the felt takes the free height, as the existing mobile rules already do for it; the
   game heading, the hint line, the declare checkbox, the feedback block and the announcements panel that stacked
   under the felt are gone. The hand stays on the felt, as today, and so do the chip row and the toasts. Below 640px
   of height the felt needs more than the window gives it, so the page scrolls rather than clip the hand.
4. **Difficulty stays visible (US-002) in the header menu.** The menu gains a first line, `Classic Belote · Relaxed
   bots` (the text the auction already uses), as plain text, set by the table and by the auction. The visually hidden `<h1>` keeps the variant name for the page title and screen readers.
5. **Messages are toasts on the felt above the hand (US-107).** The declaration message, the "X declares." note and the hint
   reason become toasts in `#tbl-toasts`, a `role="status"` region anchored above the hand and auto-dismissing. One toast
   shows at a time; a new one of a higher priority replaces it, others queue (at most three waiting; older ones are
   dropped). A repeat of the text on screen is ignored. Durations: 2.5 s for a declaration, 4 s for a hint reason, 6 s
   for an announcement detail. Reduced and Off effects (`effects.js`) remove the slide, not the timing. The turn status
   stays in the header line.
6. **Announcements are a chip row on the felt**, under the top seat. `#tbl-chips` holds, left to right, the declare toggle and one chip per
   announcement (`tierce`, `belote`). Before the first trick the chips are the player's own announcements; after the
   reveal that follows the first trick they are everyone's, a scored one marked as today (`.scored`). Tapping a chip
   shows its detail as a toast (player and announcement). The row scrolls sideways inside itself if it overflows; the
   declare chip is capped at 62% of the row and ellipsised.
7. **The declare checkbox becomes a toggle chip.** `<button type="button" role="switch" aria-checked>` labelled
   "Declare: {0}"; it is shown only while the player holds announcements and is switched on again for each round, as
   the checkbox is today. `declareChoice` reads its `aria-checked`.
8. **The round result is a panel over the lower part of the felt.** `#tbl-round-result` keeps its buttons (next round, rematch,
   results, review) and the US-114 and US-109 behaviour, but it is positioned over the lower part of the screen
   instead of below the table, so showing it does not add height. The hand is not interactive while it shows.
9. **Pure logic in two small scripts, tested in Node:** `toast.js` (the queue and its rules) and `table-chips.js`
   (the chip list from a board). `app.js` only wires the DOM, as for US-118.
10. **Behaviour is ported, not rewritten.** `loadTable(gameId)` is `loadBotGame` aimed at the new elements, and the
    helpers it calls (`renderTrickDiamond`, `renderTableSeats`, `fillHand`, `playSecondDeal`, `offerHint`,
    `celebrate*`, `showScoreBar`, hand-off) take the element or prefix they work on instead of finding `#bot-*`. The
    leave confirmation (US-110), hints (US-065), contract at seat (US-099), bot lines (US-112), the second deal, trick
    collection and the pass-and-play hand-off keep working through the same calls.

## 4. `toast.js`

Plain script with a `module.exports` guard; no DOM.

- `TOAST_MS = { declaration: 2500, hint: 4000, detail: 6000 }`; `TOAST_PRIORITY = { detail: 3, hint: 2, declaration: 1 }`.
- `makeToaster({ show, hide, setTimer, clearTimer })` returns `{ push(text, kind), clear(), current() }`.
  - `push` with a text equal to the one on screen restarts nothing and returns.
  - With nothing on screen it calls `show(text, kind)` and starts the timer of that kind.
  - With a toast on screen, a higher priority replaces it at once (the replaced one is not queued); otherwise the
    new one queues, with at most three waiting (the oldest waiting one is dropped).
  - When a timer ends, `hide()` is called and the next waiting toast shows.
  - `clear()` cancels the timer, empties the queue and hides.
  - Empty or whitespace-only text is ignored.

## 5. `table-chips.js`

- `tableChips(board, label)` returns `{ declare, chips }`. `board.ownAnnouncements`, `board.revealedAnnouncements`,
  `board.completedTricks` and `board.reviewingCompletedTrick` are the same fields `renderAnnouncements` reads.
  - `declare` is `null` without own announcements, otherwise `{ label }` with `label` the caller's text for the
    own announcements.
  - `chips` is the own announcements before the reveal (`{ id, text, scored: false, detail }`) and every revealed
    announcement after it (`scored` from the declaration), where the reveal is the first-trick pause as today
    (`completedTricks === 1 && reviewingCompletedTrick`), and stays in place for the rest of the round.
  - `detail` is built by the caller's `label` function from the player and the cards, so translation stays in `app.js`.
- A new round (no own and no revealed announcements) returns an empty list.

## 6. The screen

```
┌────────────────────────────┐
│ ☰ Menu   Your turn to play │  header (shared, unchanged)
│ N–S 640 (+82) ◂1000▸ E–W   │
├────────────────────────────┤
│        [ top seat ]        │  the felt takes the free height
│ (Declare: tierce) (tierce) │  chip row, under the top seat
│ [left]   ┌──────┐   [right]│
│          │ trick│          │
│          └──────┘          │
│ ╭toast╮      [ you ]       │  toasts float above the hand
│ ┌─┐┌─┐┌─┐┌─┐              │  hand: one row of eight, or two
│ └─┘└─┘└─┘└─┘              │  rows of four on a phone
└────────────────────────────┘
```

- The felt keeps the existing `.card-table` look; the hand keeps `.table-hand` (US-108).
- At 1280px the same grid applies with a larger table area; nothing is added. The desktop layout is US-125.
- `#tbl-round-result` is an absolutely positioned panel inside the screen, above the hand.

## 7. Texts

No new visible text is planned: the chip reuses "Declare: {0}", the menu line reuses "{0} · {1} bots", the buttons
keep their texts. The toast region gets `aria-label="Table messages"`
(new text, translated into French and Dutch and flagged for native review in the pull request). Any text added
during the work is translated the same way.

## 8. Files

- New: `static/toast.js`, `static/table-chips.js`, `frontend-tests/toast.test.cjs`,
  `frontend-tests/table-chips.test.cjs`, `frontend-tests/solo-table.test.cjs`.
- Changed: `static/router.js` (view `table`, `tabOfView`, `idRoutes`), `static/index.html`, `static/app.js`,
  `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`, `frontend-tests/router.test.cjs`, `README.md` (the
  flag), `docs/product-backlog.md` (delivered note).
- Tests that read `bot-game` or its IDs and must still pass: `clear-messages`, `home-promise`, `play-now`,
  `tutorial-banner`, `setup-sheet`, `setup-form`, `router`.
- Not changed: the Rust code, the API, the CSP, the bidding view, the private table.

## 9. Tests and checks

- **`toast` tests:** show, same text ignored, timer end hides and shows the next, higher priority replaces, equal or
  lower queues, the queue holds three and drops the oldest, `clear`, blank text; timers are injected.
- **`table-chips` tests:** no announcements; own only before the reveal; the reveal shows everyone's with `scored`;
  the chips stay after the review ends; a new round empties; `declare` null without own announcements.
- **Router tests:** `/play/bot/game/:id` returns view `table`, tab `null`, `params.id`; the bidding and private
  routes are unchanged; the tab bar stays hidden there.
- **Wiring tests (`solo-table.test.cjs`):** `data-view="table"` exists after `data-view="bot-game"`; it has the
  `tbl-*` slots of section 3 and `#tbl-toasts` with `role="status"`; the chip toggle is a `role="switch"` button; no
  `declare-option` checkbox, `announcements-panel` or `game-heading` inside it; `toast.js` and `table-chips.js` load
  before `app.js`; `app.js` defines `loadTable`, maps `table` to `bot-game` only under the legacy flag and clears the
  toaster when the view changes; the menu has the difficulty line; the new text is translated.
- **Browser checks** (Chrome; Safari listed as unverified): at 360×640, 390×844 and 1280×800 the table has no vertical
  scroll through bidding, play, a belote, an announcement reveal, a hint, the round result and the match end; the
  toasts appear above the hand and go away; the declare chip and the announcement chips work; hint, contract at seat,
  bot lines, the second deal, trick collection, play again, the leave confirmation and the round review all work; the
  difficulty shows in the menu; effects Reduced and Off; `?table=legacy` brings back the old view and `?table=new`
  the new one.
- **Repository gates:** `node --test crates/beelot-server/frontend-tests/*.cjs`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.

## 10. Risks

- **Fitting a table and a hand in 640px.** Mitigation: the existing mobile rules for the
  felt, and the browser checks at the smallest size with long player names and four announcement chips.
- **Helpers coupled to `#bot-*` IDs.** Mitigation: they take the prefix or element; the legacy view keeps passing its
  own, and the old tests keep running while the flag exists.
- **Two views in one page for a while.** Mitigation: the flag is the only switch, the old code is not edited beyond
  the shared helpers, and deleting it is a separate small change.
- **Toasts replacing always-visible text.** A declaration that scrolls by too fast is lost. Mitigation: priorities and
  the queue, the declaration also shown in the chip row, and the round review for the record.

## 11. Out of scope

The help button and sheet (US-123), the auction sheet (US-120), online and pass-and-play tables (US-121), the reaction
tray (US-020 and US-121), the desktop layout and CSS tokens (US-125), splitting `app.js` into modules, deleting the
legacy view, and any backend change.
