# US-126 — Player stations that keep clear of the played cards: design

Status: implemented; checked at four widths on a mocked online table, not in every theme. Story: `docs/product-backlog.md`.

## Decisions

1. **The script measures, the CSS shrinks.** `app-layout.js` observes the trick and the stations and the window size;
   after a change it tries four levels on the card table (`""`, `stations-compact`, `stations-minimal`, `stations-low`),
   measures every `.player-station` against every `.trick-slot .playing-card`, and keeps the first level where none
   intersect (the pure choice is `chooseStationLevel` in `table-fit.js`, tested with fake measures).
2. **Levels**: compact drops the meta line and shrinks the avatar; minimal shrinks both again; low also moves the bottom
   station down by .8rem. The trick cards never change size.
3. **Long names** (24 characters, "Deleted player") are cut with an ellipsis in the name and the meta line, at 11rem and
   less at the smaller levels, so a station cannot grow into the trick.
4. **The trick's points chip** moved from under the trick (where it covered the bottom card) to the free space left of the
   top card.
5. Solo, online and pass and play share the card table, so one mechanism serves all three. The old bot-game and private
   views carry the same `.card-table` and are covered too.

## Checked

360×640, 375×667, 414×896, 768×1024 portrait and 667×375 landscape on the online table of the mocked API (levels chosen:
low, low, none, none, minimal). Not done: a layout assertion in Node (it cannot measure), the largest hand size of US-108
and every table theme of US-087; the speech bubbles and bids shown next to a seat are not measured by the script.
