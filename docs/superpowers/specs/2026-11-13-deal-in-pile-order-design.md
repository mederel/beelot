# Deal in pile order, then sort (US-140)

## Goal

The opening deal shows the human's cards arriving in the packets and order of the pile, unsorted, and the hand is then
sorted with a slide, as a player arranges their cards.

## Design

- **Data.** `bidding.dealt` and `board.dealt` carry the viewer's own cards in the order the engine stored them: the first
  deal's packets (3 then 2 in Belote, 3, 2, 3 in Contrée) after the cut, then, after the bidding, the upturned card
  followed by the second deal's packet. Only the viewer's own hand is sent, as `hand` is; the set of cards is the same.
- **Opening deal.** While it is animated, the hand element holds the cards in `dealt` order, all hidden; the existing
  `dealCards` reveals them packet by packet in DOM order, so the packets arrive in pile order. When the last packet has
  landed, `dealCards` calls `sortHandAnimated`, which reorders the cards into `orderHandForDisplay` order and slides each
  one from where it was (FLIP with `Element.animate` on `translate`), then ends the dealing state.
- **Second deal (Belote).** `fillHand` still renders the full sorted hand. `playSecondDeal` first puts the held cards
  (sorted with the trump) followed by the new ones in arrival order (`arrivalOrder` in `card-physics.js`: the taker's
  upturned card, first among the new ones in the engine's order, moves after their packet), restyles the fan, hides the
  new cards, deals, then sorts with the fan restyled through the `restyle` callback.
- **Not animated.** With reduced motion, or for a restored table, an online table or a view that was already dealt, the
  hand is rendered sorted at once as before (`animateDeal` and `secondDeal` are false).
- **Bots' hands** stay card backs counted per packet, as before.
- The golden API files omit `dealt` (it depends on the shuffle); a dedicated test checks it.

## Tests

`card-physics.test.cjs` (`arrivalOrder`), `deal-order.test.cjs` (wiring, order of the sort in `dealCards`, reduced
motion), and `api_contract.rs` (`dealt` is the viewer's own cards in engine order, the same set as `hand`).

## Not verified here

No browser was used: the slide, the timing and the look of the packets were not seen. The Rust change was not compiled
here either; CI is the check.
