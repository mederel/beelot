# One table for online and pass and play (US-121) Implementation Plan

**Goal:** Online tables are drawn on the `table` view; the lobby is a sheet over the empty felt. Spec:
`docs/superpowers/specs/2026-11-07-online-table-design.md`.

**Architecture:** route phase `online`; `onlineTable()`; `loadOnlineTable` feeds `renderSolo` and `loadAuction` the
stream's snapshot; pure `lobby-model.js` drives the lobby sheet; reaction tray; the old `private-table` view stays behind
the US-119 flag.

## Global constraints

Vanilla JS plain scripts, `module.exports` guards, no Rust change, texts in French and Dutch, no page scroll at 360×640.

## Review focus

Stale renders (request counter and version check), the online branches of `renderSolo`, `loadAuction` and `submitBid`
(no deal animation, no hints, no client trick collection), the flag path back to the old view.

## Tasks

- [x] 1. `lobby-model.js` and its tests.
- [x] 2. Router: online routes return view `table`, phase `online`; tests.
- [x] 3. Markup (lobby sheet, reaction toggle and tray) and CSS.
- [x] 4. `onlineTable`, `tableShown`, `auctionShown`, `tableExitPath`; flag path in `viewForPath`.
- [x] 5. `loadOnlineTable`, `renderLobby`, lobby handlers, `onlineAction`; online branches in `renderSolo`,
  `loadAuction`, `submitBid`, `collectBotTrickLater`, round buttons; stream callback; leave link.
- [x] 6. Reactions tray, texts in FR and NL.
- [x] 7. Wiring tests, README, backlog note.
- [x] 8. Browser checks on the mocked API (lobby at 360×640, 390×844, 1280×800; online auction and cards; public lobby).

## Deviations found while implementing

- The model script is `lobby-model.js` (the spec's name), not `lobby-sheet.js`.
- Not run: two real browsers against a server, Safari, the Rust gates (no cargo here).
