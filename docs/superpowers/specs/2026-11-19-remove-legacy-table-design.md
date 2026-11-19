# Design: remove the legacy table views (US-160)

- **What goes.** The three views kept behind `?table=legacy` since US-119 to US-121: `bot-game` (the old solo table),
  `bidding` (the old auction) and `private-table` (the old online table), with their `private-*` DOM, their handlers
  (`loadBotGame`, `loadBidding`, `loadPrivateTable`, `privateAction`, the old lobby buttons and the old reaction bar), the
  `legacy` entries of `soloScreens` and `auctionScreens`, and the styles that only served them.
- **Routing.** `viewForPath` is the route's view; `legacyTable()` and `applyTableFlag()` are deleted. The table view is the
  only view of a match, so the score bar and the table header test for `table` alone.
- **Old devices.** Every load runs `localStorage.removeItem("beelot.legacy-table")` in a `try`, so a device that holds the entry
  loses it and blocked storage is no error. `?table=` is not read: `?table=legacy` loads the one table and stays in the
  address, which is harmless because the router looks at the path only.
- **What stays on purpose.** `#private-form-message` and `#join-private-table-form` (the join form of the crew page, not the old
  table), the `beelot.private-table-session` key (`getPrivateSession` reads the tab's seat from it), `announcementName`,
  `roundScoreText` and the seat helpers of the new table. `renderSolo` and `loadAuction` keep their `ui` argument, with the
  table's screen as the only one.
- **CSS.** A script walks `styles.css`, drops the selectors that name an id, a class or a `data-view` that no script or markup
  uses any more (also inside `:is()`), and drops the rules and media blocks left empty. The diff was read by hand.
- **Tests.** Tests that only checked the flag or the old views are deleted, those that checked both views now check the table
  (`tableView` ends at the `private` view). `legacy-removed.test.cjs` checks that the views, the `private-*` ids, the helpers and the
  README paragraph are gone, that every id a script selects exists in the page, and runs the cleanup of the old entry.
- **Browser checks, before and after.** On a real server (`cargo run -p beelot-server` with the compose MariaDB), Chromium at
  375x667: solo (setup sheet, auction sheet, a trick played, no page scroll), pass and play (hand-off card, second player's
  auction), online lobby with two browsers (code, join, ready, start with bots), online cards (auction and five tricks, both
  browsers in step). After the removal the solo and online checks were repeated, and a device with the old entry set was loaded
  with `?table=legacy`.
