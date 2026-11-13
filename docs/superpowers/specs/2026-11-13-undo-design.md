# Undo my last card (US-146)

## Design

- The server keeps an undo point at a solo table (not pass-and-play, not online): a copy of the board taken just before the
  human's card, with the time of the card. Any other action that changes the match (bid, continue, next round, rematch,
  start, leave) drops it, and so does a card that ends the round, whose score is already counted.
- `Action::Undo` restores the board copy. The bots' replies are not stored: the bots choose from their view with a seed
  derived from that view, so playing the same card again gives the same replies.
- Three undos per match (`UNDO_LIMIT`), counted by the table and reset by a rematch; a request later than eight seconds
  after the card is refused. The snapshot says `undoOffered` and `undosLeft`; the button shows the count and hides itself
  after seven seconds.
- `FinishedMatch.undos` carries the count to the handover. Because the limit is enforced by the table, a match never has
  more than allowed, so ratings and statistics need no filter.

## Not verified

The Rust (table, snapshot, tests) was written without a toolchain and has not been compiled or run; CI is the first run.
The count is not stored in the database (no migration): it exists on the handed-over match only. No browser check of the
button.
