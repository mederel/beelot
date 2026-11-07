# US-121 — One table for online and pass and play: design

Status: implemented, decisions taken by the implementer (see section 3). Story: `docs/product-backlog.md`, Phase 8.
Builds on US-119 (`2026-11-07-solo-table-design.md`: the `table` view, `renderSolo`, `soloScreens`, toasts, chips, the
`?table=legacy` flag) and US-120 (`2026-11-07-auction-sheet-design.md`: `loadAuction`, the auction sheet).

## 1. Goal

An online table (private or public) is drawn on the same `table` view as the solo game: the lobby is the table before the
deal, the same screen then shows the auction and the cards, reactions are a tray, and the connection state is in the
header status line. Pass and play already runs on the solo table (it is a local table with a hand-off cover) and keeps
its behaviour. The old `private-table` view stays behind the US-119 flag until the new one passes the browser checks on a
real server.

## 2. Today

- `/online/private/table/:id` and `/online/public/table/:id` are the view `private-table`: its own markup (`private-*`
  IDs, about 200 lines), lobby (code, seat list, ready, start, start with bots, owner rules), a game panel with its own
  felt, auction controls, reaction bar and round result, and its own renderers (`showPrivateTable`, `loadPrivateTable`,
  `renderPrivateBoard`, `renderPrivateBidding`, `privateAction`).
- The server answers one snapshot shape for every table (`{version, tableId, kind, you, table, bidding?, board?, match?,
  reactions}`), and an event stream pushes newer ones (`openTableStream`, `latestSnapshots`, `currentSnapshot`).
  Solo, pass and play and online tables are all driven through `api.table` and `api.act`.
- Pass and play is `kind: LOCAL` with `table.passAndPlay`; `handOff` covers the cards between humans.

## 3. Decisions

1. **The online routes open the `table` view with phase `online`.** `routeFor("/online/private/table/:id")` and
   `routeFor("/online/public/table/:id")` return view `table`, tab `null`, `phase: "online"`. Under the legacy flag
   `viewForPath` returns `private-table` for them. `onlineTable()` says whether the address is an online table on the new
   screen. `renderView` calls `loadOnlineTable(id)` for it.
2. **Three adapters over one table module.** The module is `renderSolo` (cards), `loadAuction` (auction) and the lobby
   sheet; the adapter is what differs between modes, chosen by `tableAdapter()`:
   - `solo` and `pass`: snapshot from `api.table`, trick collected by the client (`continueTrick`), next round and rematch
     go through the bidding route, hand-off and hints as today.
   - `online`: snapshot from `currentSnapshot` (stream first), the server collects the trick (the client refreshes when
     the reveal time is up), next round and rematch stay on the table, no deal animation and no reveal of calls one by
     one (the seats show each call as the snapshot has it), leave link to the online home, leave state `online`.
   `renderSolo` and `loadAuction` take an optional known snapshot, so `loadOnlineTable` can hand them the one it holds.
3. **The lobby is a sheet over the empty table.** `#lobby-sheet` is a non-modal panel like the auction sheet, shown
   while the table is `WAITING_FOR_PLAYERS`: invitation code with Copy and Share (the Web Share API when there is one,
   the copy otherwise), the four seats in table order with their team, ready state and connection, "Sit here" on empty
   seats of a private table, "I am ready", the owner's "Start game" and "Start now with bots", the owner's table rules
   (turn timer, announcements, tout-atout and sans-atout in Contrée, match target) and for everyone a one-line summary of the
   rules, and for a public table the countdown to the bots and "Leave table". When the table is `IN_PROGRESS` the sheet
   goes and the cards or the auction sheet take its place on the same screen.
4. **What the lobby shows is a pure model.** `lobby-model.js` turns a table snapshot into `{ showCode, code, seats, ready,
   start, startWithBots, rules, summary, publicWaiting }` (section 4); `app.js` draws it. The owner-only controls are
   absent for everyone else, not disabled.
5. **Reactions are a tray.** A button on the felt (`#tbl-reactions-toggle`, 😀, `aria-expanded`) opens `#tbl-reaction-tray`
   with the six presets over the hand; a tap sends one and closes it; bubbles appear next to the sending seat
   (`#tbl-reaction-layer`). The button is shown only at online tables in progress when reactions are enabled in the
   settings (US-020).
6. **The header status line carries the rest.** The connection state of the viewer's seat (disconnected, bot takeover)
   replaces the turn text while it lasts; the rematch vote keeps its place in the end-of-match screen (US-114), which the
   shared `celebrateMatchEnd` already draws; the turn timer policy stays in the lobby summary and an expired turn is
   played by a bot on the server. The turn timer countdown is out of scope (the API sends no deadline).
7. **The leave link follows the mode.** The header menu's leave link points to `/online/private`, `/online/public` or
   `/play/bot` and the leave state tells the confirmation sheet what happens (US-110).
8. **`private-*` is not removed here.** The acceptance criterion that removes the `private-table` DOM and IDs waits for
   the story that retires the flag (as US-119 and US-120 did for their old views); the old view and its code are not
   edited beyond sharing helpers. The delivered note says so.

## 4. `lobby-model.js`

Plain script with a guarded `module.exports`; no DOM, no translation.

`lobbyModel(table)` returns:

```
{
  showCode: !table.publicTable,
  code: table.invitationCode,
  title: "Gather your team." | "Looking for players…" (public),
  seats: [0, 1, 2, 3].map((position) => ({ position, team, empty, you, name, ready, connection, canSit })),
  ready: { shown: Boolean(you) && waiting, on: you.ready },
  start: { shown: owner && waiting && !table.publicTable, disabled: !all four seated and ready },
  startWithBots: { shown: owner && waiting && !publicTable && seats < 4, disabled: !every seated player ready },
  rules: { shown: owner && waiting && !publicTable, timer, announcements, allTrumps: variant CONTREE, target },
  summary: { timer, announcements, allTrumps, target, variant },
  publicWaiting: publicTable && waiting && Boolean(you)
}
```

`you` is the seat with `you`; `owner` is `you.position === table.ownerPosition`; `waiting` is `status === "WAITING_FOR_PLAYERS"`;
`canSit` is an empty seat of a private waiting table when the viewer has a seat; `connection` is `"connected"`,
`"disconnected"` or `"bot"` from `connectionState`; `team` is `North–South` for even positions, `East–West` for odd ones.

## 5. The screen

```
┌────────────────────────────┐
│ ☰ Menu      Private table  │  header (status: table kind, connection)
├────────────────────────────┤
│   the empty felt           │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ▔▔▔  Gather your team.     │  lobby sheet
│ Code  K7M2QX [Copy][Share] │
│ N–S  Anna ✓   · E–W  Luc ✓ │  seats (two columns, one per team)
│ N–S  [Sit here] · E–W …    │
│ Rules: timer, announcements│  owner only
│ [ I am ready ] [ Start ]   │
└────────────────────────────┘
```

At 360×640 the sheet takes at most 60% of the height and scrolls inside itself if the owner's rules need more.

## 6. Texts

New, translated into French and Dutch and flagged for native review: "Share", "Join my Beelot table: code {0}",
"Table rules", "Open reactions". Reused: everything else the old lobby, reactions and settings already say.

## 7. Files

- New: `static/lobby-model.js`, `frontend-tests/lobby-model.test.cjs`, `frontend-tests/online-table.test.cjs`.
- Changed: `static/router.js` (online routes), `static/index.html` (lobby sheet, reaction toggle and tray), `static/app.js`
  (`onlineTable`, `loadOnlineTable`, lobby drawing and handlers, adapters in `renderSolo`, `loadAuction`, `submitBid`,
  `playCard`, the round buttons, reactions, the leave link, the stream callback), `static/styles.css`, `static/i18n.js`,
  `static/i18n-nl.js`, `frontend-tests/router.test.cjs` (and the tests that name the online routes), `README.md`,
  `docs/product-backlog.md`.
- Not changed: the Rust code, the API, the CSP, the old `private-table` view.

## 8. Tests and checks

- **`lobby-model` tests:** each field for a private lobby seen by the owner, a guest and a spectator; start enabled only
  with four ready players; start with bots only with an empty seat and every seated player ready; rules only for the
  owner and only while waiting; tout-atout only in Contrée; a public table shows no code, no rules, no start and shows the
  waiting state; `canSit`; connection states; teams.
- **Router tests:** the online routes return view `table`, phase `online` and the id; other routes unchanged.
- **Wiring tests:** the lobby sheet and the reaction tray exist on the `table` view with their IDs; `lobby-model.js` loads
  before `app.js`; `app.js` maps the online routes to `private-table` only under the flag, defines `onlineTable`,
  `loadOnlineTable`, `renderLobby`; `renderSolo` and `loadAuction` accept a known snapshot; the stream callback reloads the
  new table; the round buttons stay on the table online; the new texts are translated.
- **Browser checks** (Chrome; Safari unverified), on a real server when available, else on the mocked API: the lobby at
  360×640, 390×844 and 1280×800 with no page scroll; two browsers join a private table, choose seats, get ready, start,
  bid and play a trick (both update without reloading), send a reaction; quick match with bots after 60 seconds;
  disconnect shows in the status line; `?table=legacy` brings back the old view.
- **Repository gates:** `node --test crates/beelot-server/frontend-tests/*.cjs`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.

## 9. Risks

- **A port without a real server to run.** The shapes come from the contract snapshots and the old code; the first run on
  a real server may show gaps (stream timing, the reveal of the auction's closing calls). Mitigation: the old view stays
  behind the flag, and the pull request lists what was not run.
- **Calls are not revealed one by one online.** A player sees the auction as it stands. Mitigation: the history line of the
  auction sheet lists the calls in order.
- **Two renderers drawing at once** (a stream snapshot during an action). Mitigation: a request counter drops stale
  answers, as `loadPrivateTable` does.

## 10. Out of scope

The turn timer countdown, deleting the old `private-table` view and its IDs, the help sheet (US-123), the desktop layout
(US-125), changing the API or the rules of online tables.
