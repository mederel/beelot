# See my costly mistakes (US-067)

- `beelot_game::bot::review::costly_cards(tricks, trump, seat, budget)`: every hand is rebuilt from the cards its seat
  played. For each card of the seat, the double-dummy solver (US-052) values the position before the card and after it;
  the team's loss is the difference of what its side scores. A card is costly from 10 points
  (`COSTLY_POINTS`); the result carries the better card (the solver's best) and the points lost. The newest cards are
  solved first, being the quickest; the search stops at the budget and says it was `complete: false`.
- `GET /api/tables/{id}/analysis` (table token, as the hint): only a solo table (one human) with a finished round;
  otherwise 409 `no-review`. The table is locked only to copy the tricks; solving runs in a blocking thread, so
  neither the table nor the next round waits. Budget: 4 seconds.
- Review: opening it from a solo result asks for the analysis. The deal step says that the cards are being analysed,
  then how many were costly; stepping to a trick tells "Your {card} cost your team {n} points; the {card} was better."
  and outlines the card. A failure or a pass-and-play table shows nothing. FR and NL texts.
- Tests: solver self-play has no costly card; random play only yields costly cards of 10 points or more, never the best
  card, in play order; a zero budget is incomplete. The review overlay tests cover the note.
- Not verified here: the Rust crates were not compiled (no crates.io); CI is the first full check.
