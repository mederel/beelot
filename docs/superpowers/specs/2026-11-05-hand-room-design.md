# More room for my hand (US-108) — design

## Goal

On a phone the player reads and taps every card of the hand without squinting or
mis-tapping (`docs/product-backlog.md`, US-108). Frontend only, in
`crates/beelot-server/static/`.

## Today (measured at 375×667)

Eight cards are drawn about 46–58 px wide in a single fan with a 33 px step: only
a 33 px slice of each card shows, narrower than the 44 px touch target, and the
player's name pill sits right on the cards. No single row can do better: eight
44 px slices plus a card need about 390 px of a 343 px-wide table.

## Decisions

- **Portrait phones (≤ 600 px wide) lay the hand out in two rows** instead of a
  fan. `handLayout(count)` (pure, in `card-physics.js`) returns `{ cols, rows }`:
  up to 4 cards in one row, otherwise `ceil(count / 2)` columns and 2 rows
  (8 → 4+4, 6 → 3+3). The hand is a CSS grid (`--hand-cols`, `data-rows` set by a
  small `layoutHand(element, count)` helper) of larger cards, 60×86 px, with no
  horizontal overlap. The second row overlaps the first by its lower half, so the
  rank and suit of every first-row card stay visible. Every card has a target of
  at least 60×46 px (≥ 44 px).
- **The fan rotation is dropped in that layout**; the playable-card lift and
  highlight (`legal-card`, `hint-card`) are kept.
- **The name pill moves above the hand** (`station-bottom` is positioned from the
  hand's height, using the `data-rows` attribute), so it never covers a card.
- **Landscape phones (≤ 760 px wide, landscape) keep the fan but open it up:** the
  overlap shrinks so the visible slice is at least 44 px (there is width to spare).
- **Tablets and desktops (> 760 px) are unchanged.**
- The same hand layout serves the auction's five-card hand and the private
  table's hand (they share `.table-hand`).
- No new text, so no translation.

## Tests

`frontend-tests/hand-room.test.cjs`: `handLayout` for 0–8 cards; the portrait
rule (grid, card ≥ 44 px, row step ≥ 44 px) and the landscape overlap (slice
≥ 44 px) read from the stylesheet. The layout is checked in a browser at 360, 375
and 414 px wide and in landscape (667×375): no card or pill overlap, every
first-row card's index visible, every target ≥ 44 px.

## Addendum (found in the browser)

The announcements panel under the table shrinks the flex table, which pushed the
pill onto the trick. In this layout the table therefore gets a minimum height that
fits the trick, the pill and the hand (430 px with one row, 480 px with two); the
page scrolls a little when the panel is open instead of squeezing the felt.

## Addendum: landscape

In landscape the player's pill moves to the corner beside the fan, and the
header's two bars share one row while the heading is hidden, so the table has the
height the phone lacks (found while checking 667×375: the 130 px header of US-106
left no room).
