# US-120 — Auction in a sheet: design

Status: proposed (decisions taken by the implementer, see section 3). Story: `docs/product-backlog.md`, Phase 8.
Context: section 5.4 of `2026-11-06-ui-refactor-wireframes-design.md`. Builds on US-119 (`2026-11-07-solo-table-design.md`:
the `table` view, `renderSolo`, `soloScreens`, the toaster, the `?table=legacy` flag).

## 1. Goal

A solo auction is played on the same table as the cards, with the choices in a sheet at the bottom of the screen
instead of a separate `bidding` view. The player sees their hand while bidding, the history of calls in one line, only the
choices that exist (Classic: take or pass, then a suit; Contrée: value, suit, pass, coinche) and a reason for every
choice that is disabled. The old `bidding` view stays behind the US-119 flag until the new one passes the browser checks.

## 2. Today

- `/play/bot/bidding/:id` is the view `bidding` (`index.html`): its own felt (`#bidding-card-table`, prefix `bidding`),
  the upturned card in the middle, a caption, and an `auction-dock` below: accept and pass buttons, a help line, a hint
  reason, the four trump buttons (Classic round 2) or the value and suit radio groups with "Make bid" and "Coinche"
  (Contrée). On a phone the felt (480px with an eight-card hand) and the dock together exceed 640px, so the page scrolls.
- `loadBidding` fills it from `bidding` (`variant`, `round`, `calls`, `auction`, `highestBid`, `highestBidSuit`,
  `highestBidder`, `coincheAllowed`, `playerTurn`, `upturnedCard`, `hand`, `complete`); `submitBid` plays a call, `playOpeningDeal`
  deals and reveals the early calls, `revealCalls` and `announceCall` show bot calls on the seats, `highlightHintBid`
  points at a button (`#pass-bid-button`, `#coinche-button`, `#contract-bid-button`, the accept button, the trump buttons).
- Illegal values are disabled by `updateAmountChoices` and the all-trumps choices hidden by `offerAllTrumpChoices`, with no
  reason; a Contrée player at 160 has a disabled "Make bid" and no explanation.
- A completed auction navigates to `/play/bot/game/:id`, which US-119 draws on the `table` view.

## 3. Decisions

1. **The auction is drawn on the `table` view.** `routeFor("/play/bot/bidding/:id")` returns view `table`, tab `null`
   and a new field `phase: "auction"` (`null` for every other route). `viewForPath` swaps in
   `bidding` while the legacy flag is on, as it does for the game route. `renderView` calls `loadAuction(id)` for the phase
   `auction` and `loadTable(id)` otherwise; both leave the same screen, so going from the auction to the cards keeps the
   seats, hand and score bar in place instead of redrawing a view.
2. **One renderer for both auction screens.** `loadBidding` becomes `renderAuction(gameId, ui)` with `auctionScreens.legacy`
   (prefix `bidding`, the old IDs and buttons) and `auctionScreens.table` (prefix `tbl`, the `auction-*` IDs below), and
   `reloadAuction` reloads whichever is on screen. `submitBid`, `playOpeningDeal` and `highlightHintBid` take the screen
   they act on. Seats, bot expressions, calls on the seats, the opening deal and the hand-off work through `ui.prefix`.
3. **The sheet is a panel, not a modal `<dialog>`.** `<section class="auction-sheet" id="auction-sheet">` sits on the table
   view, anchored to the bottom, above the felt. A modal sheet would put the header out of reach (menu, leave table, hint),
   and the leave confirmation (US-110) and the hint belong to the auction. It is a region with an accessible name
   ("Your call") and no focus trap; its grabber is decorative. It is shown only in the phase `auction`.
4. **The hand is in the sheet.** The sheet covers the lower part of the felt, where the hand sits, so it carries its
   own strip with the player's cards (`#auction-hand`: small faces in one overlapping row, five or eight cards, a card per
   `cardElement`). The felt keeps the seats and their calls above the sheet; the opening deal still animates to the seats
   and to `#tbl-hand`, which is under the sheet and is the target of the deal.
5. **The sheet shows one of three modes, from a pure model** (section 4):
   - **Classic, round 1:** "Take {suit}?" with the upturned card, buttons "Take {suit}" and "Pass".
   - **Classic, round 2:** "Choose a trump suit": the four suit buttons (the upturned suit disabled, with its reason) and "Pass".
   - **Contrée:** a value scroller (80 to 160, a horizontal radio group), a suit row (the four suits, plus no-trumps and
     all-trumps when the table plays them), a "Bid {value} {suit}" button, "Pass", and "Coinche" when allowed.
6. **Bidding history in one line.** `#auction-history` lists the calls so far in speaking order, "Luc: 110 ♥ · Manon:
   pass", from `bidding.auction`; hidden before the first call. It is not a live region (the seats and the header already announce each call) and it
   scrolls sideways if it overflows.
7. **Every disabled choice gives a reason**, in one `#auction-reason` line under the choices and in `aria-describedby`
   of the control: a value at or below the standing bid ("Bid more than 110"), a bid when the standing bid is 160 ("No
   higher bid is possible: pass or coinche"), the upturned suit in round 2 ("That suit was passed on the first round"),
   and every control when it is not the player's turn ("Waiting for {name}…"). The reason shown is the one for the
   choice last focused or selected, falling back to the first applicable one.
8. **The hint reason is a line in the sheet** (`#auction-hint-reason`, as `#bid-hint-reason` is today), and the hint
   highlights the sheet's control; the header's hint button is unchanged.
9. **Pass-and-play and the waiting state are kept.** The hand-off sheet covers the table as before; during a submitted
   call the view gets `auction-waiting-view` (controls disabled, no double submit).
10. **New round and rematch** go to `/play/bot/bidding/:id` as today, and now open the sheet over the same table.
11. **The old view is not edited beyond sharing the helpers.** It is deleted by the story that retires the flag.

## 4. `auction-sheet.js`

Plain script with a guarded `module.exports`; no DOM, no translation (it returns English keys and values; `app.js` calls `t`).

`auctionSheet(bidding, options)` where `options = { allTrumps }` returns:

```
{
  mode: "take" | "suit" | "bid",
  title: "Take {0}?" | "Choose a trump suit" | "Your call",
  titleSuit: "HEARTS" | null,                   // the suit for {0}
  history: [{ player, call }],                  // bidding.auction as is, passes included
  enabled: boolean,                             // bidding.playerTurn && !bidding.complete
  take: { suit, disabled } | null,              // mode take
  suits: [{ suit, disabled, reason }],          // mode suit: the four suits; mode bid: four plus NO_TRUMPS and ALL_TRUMPS
                                                //   when options.allTrumps (contrée only)
  values: [{ value, disabled, reason }] | null, // mode bid: 80..160 by 10
  pass: { disabled, reason },
  coinche: { shown: bidding.coincheAllowed, disabled },
  bid: { value, suit, disabled, reason } | null // mode bid: the lowest legal value, and the standing bid's suit or the first suit
}
```

Rules: `mode` is `bid` for `CONTREE`, `take` for Classic round 1, `suit` for Classic round 2. A value is disabled when it is
at or below `highestBid`, with reason "Bid more than {0}" (`{0}` = `highestBid`); when `highestBid` is 160 every value is
disabled and `bid.reason` is "No higher bid is possible: pass or coinche". In mode `suit` the upturned card's suit is
disabled with reason "That suit was passed on the first round". When `enabled` is false every control is disabled with
reason "Waiting for {0}…" (`{0}` = `bidding.activePlayer`) and no per-value reason. `bid.value` is the lowest enabled
value (or 160); `bid.suit` keeps the player's chosen suit when the caller passes it as `options.suit` and it is still
legal, otherwise the first legal suit. Nothing is mutated.

## 5. The screen

```
┌────────────────────────────┐
│ ☰ Menu   Luc is deciding…  │  header (unchanged)
│ N–S 0 (+83) ◂1000▸ E–W 182 │
├────────────────────────────┤
│        [ Luc: 110 ♥ ]      │  the felt, seats and their calls
│ [Camille]          [Manon] │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ▔▔▔   Your call            │  sheet
│ You: 90 ♥ · Camille: pass  │  history, one line
│ [9♣][7♦][9♦][Q♦][K♦][8♥]…  │  your hand
│ 80 90 100 [110] 120 130 →  │  value scroller
│ ♣  ♦  ♥  ♠  NT  AT         │  suit row
│ Bid more than 110          │  reason
│ [ Pass ] [ Bid 120 ♥ ]     │
│ [ Coinche ]                │
└────────────────────────────┘
```

At 360×640 the sheet takes at most 56% of the height (`max-height: 56dvh`) and its choices scroll inside it if a
future text makes it longer; the page does not scroll. In Classic the sheet is shorter: title and upturned card, history,
hand, two buttons.

## 6. Texts

New, translated into French and Dutch and flagged for native review: "Your call" (the sheet's name and Contrée title),
"Take {0}?", "Bid {0}" (the bid button), "Bid more than {0}", "No higher bid is possible: pass or coinche", "That suit
was passed on the first round", "Waiting for {0}…", "Bidding so far" (the history's `aria-label`). Reused: "Pass",
"Coinche", "Take {0}", "Choose a trump suit", "Your five cards", "Your eight cards", the suit names, the pass help
lines (shown as the pass button's `aria-describedby` text when no reason applies).

## 7. Files

- New: `static/auction-sheet.js`, `frontend-tests/auction-sheet.test.cjs`, `frontend-tests/auction-table.test.cjs`.
- Changed: `static/router.js` (`phase`), `static/index.html` (the sheet on the `table` view, script tag), `static/app.js`
  (`renderAuction`, `auctionScreens`, `loadAuction`, `reloadAuction`, `submitBid`, `playOpeningDeal`, `highlightHintBid`,
  `viewForPath`, `renderView`), `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`, `frontend-tests/router.test.cjs`,
  `README.md` (the flag now covers the auction), `docs/product-backlog.md` (delivered note).
- Tests that read the bidding view or its IDs and must still pass: `clear-messages`, `friendly-bots`, `play-now`,
  `setup-sheet`, `tutorial-banner`, `router`, `solo-table`.
- Not changed: the Rust code, the API, the CSP, the private table's auction, the old `bidding` view.

## 8. Tests and checks

- **`auction-sheet` tests:** the mode for Contrée, Classic round 1 and round 2; history passes through; values at or
  below the standing bid disabled with the reason; 160 disables every value and gives the "no higher bid" reason; the
  upturned suit disabled in round 2; no-trumps and all-trumps only when `allTrumps` and only in Contrée; not the player's
  turn disables everything with the waiting reason; `bid.value` and `bid.suit` (kept when legal, replaced when not);
  coinche shown only when allowed; the input is not mutated.
- **Router tests:** the bidding route returns view `table`, tab `null`, `phase: "auction"` and `params.id`; the game
  route returns `phase: null`; other routes unchanged.
- **Wiring tests (`auction-table.test.cjs`):** the sheet exists inside `data-view="table"` with the IDs of the model
  (`auction-title`, `auction-history`, `auction-hand`, `auction-upturned`, `auction-values`, `auction-suits`,
  `auction-trumps` (the four suit buttons of Classic round 2), `auction-reason`, `auction-hint-reason`, `auction-pass`, `auction-bid`, `auction-take`, `auction-coinche`) and the
  value and suit groups named `auction-value` and `auction-suit`; it is a region, not a dialog; `app.js` maps the bidding
  route to `bidding` only under the flag, defines `renderAuction`, `loadAuction`, `reloadAuction`; `submitBid` and
  `playOpeningDeal` take the screen; the new texts are translated.
- **Browser checks** (Chrome; Safari unverified), on a real server and with the contract snapshots mocked: at 360×640,
  390×844 and 1280×800 there is no vertical scroll in a Contrée auction and a Classic auction in both rounds; the hand is
  visible in the sheet; the history grows with the calls; disabled values and suits give their reason; a bid, a pass, a
  take, a coinche and a bot's contract move on to the cards without redrawing the page; the opening deal, the bots'
  calls on the seats, the hint, the pass-and-play hand-off, the leave confirmation, a new round and a rematch all work;
  effects Reduced and Off; `?table=legacy` brings back the old view.
- **Repository gates:** `node --test crates/beelot-server/frontend-tests/*.cjs`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.

## 9. Risks

- **A sheet over the hand it describes.** Mitigation: the hand strip in the sheet, and the browser checks at 360×640
  with eight cards and a long history.
- **Moving the auction onto the `tbl-*` elements breaks something the old IDs carried** (the deal animation, calls on
  the seats, hand-off, hints). Mitigation: every helper takes the prefix or screen, the old screen keeps its own, and the
  old tests keep running while the flag exists.
- **Choices the player cannot reach while it is the bots' turn.** The sheet stays open and disabled with a reason, so the
  player sees the history grow rather than a blank table.
- **Texts too long for the reason line in French or Dutch.** Mitigation: the line wraps to two lines at most and is checked
  at 360px.

## 10. Out of scope

The online auction (US-121), the help sheet (US-123), the desktop layout (US-125), deleting the old view, changing the
bidding rules or the API, and the reaction tray.
