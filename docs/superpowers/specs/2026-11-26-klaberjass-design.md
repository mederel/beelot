# Design: play Klaberjass, the two-player game of the family (US-219)

Issue: [#512](https://github.com/mederel/beelot/issues/512). Siblings: US-222 (Differenzler, variable seat counts too) and
US-218 (Bela, which shares a name).

## Problem

Every Beelot table seats four players in two teams. A player with one opponent has no game. Klaberjass (Clob, Klab, also
called "Bela" in some places) is the two-player game of the Belote family, and Beelot's engine already holds most of its
rules.

## Decision

Klaberjass is a new `Variant` for exactly two seats. Seats 0 and 1 play, each as its own "team" (`Team::of` keeps its
parity rule: seat 0 is North–South in the score, seat 1 East–West), so the match score, the history and the rating keep
working unchanged. The variant knows its seat count (`Variant::seat_count()`: 4, and 2 for Klaberjass); every place that
counted to four asks the variant.

### The chosen rule set

The article the issue cites (Wikipedia, "Klaberjass") could not be read from the build environment (the host is blocked),
so these rules are the common ones of the family, chosen to reuse the engine's Classic Belote rules wherever the two
games agree. They are the part of this spec to review against the sources.

| Subject | Rule |
| --- | --- |
| Cards | 32 cards, 7 to ace. |
| Dealing | Six cards each, in two packets of three, the non-dealer first; the next card is turned up; the other cards are the talon. |
| Bidding, round 1 | The non-dealer, then the dealer, may *take* (the turned-up card's suit is trump) or pass. |
| Bidding, round 2 | If both passed, the non-dealer, then the dealer, may name another suit as trump, or pass. |
| All pass | The cards are gathered and the other player deals. |
| After the bid | Each player is dealt three more cards, the non-dealer first: nine cards each. The turned-up card goes back to the talon: nobody takes it, and there is no exchange of the trump seven. The 14 cards left are never played. |
| Leader | The non-dealer leads the first trick; the winner of a trick leads the next. Nine tricks. |
| Ranking and points | As Classic Belote under the trump suit: trump J 20, 9 14, A 11, 10 10, K 4, Q 3; other suits A 11, 10 10, K 4, Q 3, J 2. Order in trump J, 9, A, 10, K, Q, 8, 7; elsewhere A, 10, K, Q, J, 9, 8, 7. |
| Obligations | Follow the suit led; a player who cannot follow **must trump**; a trump lead, or a trump already played, must be **beaten** when the hand can. (The engine's `rules::legal_cards`, with no partner to spare a player from trumping.) |
| Last trick | **10 points** (the "dix de der") for the player who wins it. |
| Belote | King and Queen of trump in one hand: 20 points once both are played. No other announcement: sequences are not played. |
| Round score | As Classic Belote: the player who took the trump must score **more** than the other (cards, last trick and Belote); if not, the other player scores 162 and the taker keeps only their Belote. |
| Nine tricks | A player who wins all nine tricks scores 250 (the Classic capot). |
| Match | First to 500 points (the targets of the match are the usual 500, 1,000, 1,500 and 2,000); the default is 500. |

No announcements and no all-trumps/no-trumps options exist in this variant; the lobby hides them.

### The engine

- `BiddingState` and `GameBoard` hold a seat count (`Variant::seat_count()`); their rotations (`% 4`), the trick size, the
  number of tricks (8, and 9 for Klaberjass) and the pass counts use it. Klaberjass follows the Classic auction code path
  (accept the turned-up suit, then name another), with packets `[3, 3]` and the nine-card hands. The hands array keeps four
  slots, and the unused ones stay empty.
- `scoring::score` counts "every trick" as 8 or 9 by variant; everything else is Classic's.
- Bots: `strategies` hands a Klaberjass view to a dedicated, simple two-player heuristic bot (`bot::klaberjass`): it takes
  with enough trump strength, wins tricks cheaply, and plays low when it cannot win. The sampling, solver and
  memory machinery stay four-seat; hints, the review and the coach answer "not available" for this variant.

### The table crate

`beelot-table` takes its seat count from the lobby's variant: the lobby holds the same four slots and uses the first
`seat_count`; seating, readiness, the bots that fill empty seats, local seats, the first dealer, the next dealer, the undo
(which gives back the human's last card against the one bot), rematch votes, the reactions' per-seat limits and the
messages (`(seat + 1) % 4`) use it. Every 4-seat test and behaviour stays as it was.

### The server and the frontend

- The variant is stored as text (`KLABERJASS`), so the leaderboard, the ratings and the matchmaking queue, already kept per
  variant, keep Klaberjass apart from the four-player results with no migration.
- Snapshots carry two seats; the frontend lays a two-seat table with the opponent on top (`seatCount` in the snapshot),
  adds the variant to the choosers, and shows the turned-up card and the talon in the auction.
- Texts in English, French and Dutch (`t()` keys); a rules page `pages/docs/klaberjass.html`; layout checks for the
  two-seat table in `e2e/key-screens.spec.ts`.

## Out of scope

Three-player variants. Sequences ("tierce" and the like) and the 100-point melds of other Klaberjass sources.

## Risks

The rules above need a review against the sources. The server and frontend share their seat arithmetic through the
snapshot's `seatCount`, so a client that predates it keeps four seats and would not show the variant.
