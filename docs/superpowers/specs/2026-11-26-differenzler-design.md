# Design: play Differenzler Jass (US-222)

Issue: [#515](https://github.com/mederel/beelot/issues/515). Depends on US-220 (Schieber, #513): this story reuses its
Jass card set, trump and card-play rules, and its i18n for de/it. It shares the variable seat count with US-219 (Klaberjass,
#512). Sources: [Pagat](https://pagat.com/jass/differenzler.html), [rulespal.com](https://rulespal.com/differenzler/rulebook).

## Problem

Beelot has no individual Jass: every variant scores two partnerships. Differenzler is played by 3 or 4 players, each alone,
and a player's score is how far their points are from the points they announced.

## Decision

### Rules (`beelot-game`)

- `Variant::Differenzler`, 36 cards, 3 or 4 seats, no partnerships. Card values, trick play and the trump order are those of
  Schieber (US-220); the last trick scores 5; a deal is 157 points.
- **Deal**: 4 players get 9 cards. With 3 players the 6s are not removed; each gets 9 and the dealer turns up the trump
  from the 9 remaining cards (the exact 3-player deal is checked against Pagat while implementing and fixed here if it
  differs).
- **Trump**: the dealer turns a card up; its suit is trump. The turned card goes to the dealer. **The 6 of trumps is not
  exchanged** for the indicator (unlike Schieber).
- **Announcement**: before play, in turn from the dealer's left, each player announces 0–157 points they expect to take.
  Announcements are public. Several players may announce the same number.
- **Play**: follow suit; a trump may be played whenever you cannot follow; you may not undertrump unless you hold only
  trumps (Pagat's rule, which this story adopts as "the chosen source").
- **Score**: per deal, `|announced − taken|` for each player; the match is a fixed number of deals (one per seat, so each
  player deals once; `deals` in the table settings); the lowest total wins, ties are shared.

### Table (`beelot-table`)

- Seat count 3 or 4 comes from the variant (reusing US-219's seat-count generalisation once merged, not a copy).
- A match scores per **seat**, not per team: `MatchScore` gains an individual mode, a vector of totals indexed by seat.
  Team variants keep their two totals.
- A new action `Announce(points)` and a bidding phase `Announcing` with the seat whose turn it is. Refusals reuse
  `refusal.rs`: out of turn, out of range.
- Bots announce from the strength of their hand (expected points: trump length, aces and tens, top trumps) and play to
  match: they take tricks while under their announcement and duck once they are at or over it.

### Server and frontend

- The wire format carries `announcements` and per-seat totals; the lobby offers the variant and 3 or 4 seats.
- **Score bar**: for an individual variant it lists each player with their total, and during play "taken / announced".
- An announcement picker (a stepper and quick values) appears in the announcing phase.
- Texts in German, French, Italian, English, Dutch (US-220 introduced de/it; this story adds only its own keys).
- Layout checks: the announcing phase and an individual score bar at 3 and 4 seats on the key screens; a long name case in
  `e2e/extremes.spec.ts`.

### Docs

A rules page in `pages/docs/` for Differenzler; the configuration page is unchanged.

## Tests

- Game: score of a deal, no 6 exchange, undertrump refusal, 3 and 4 seat deals, seed-stable fixtures.
- Table: announcement order and refusals, per-seat totals, a full 3-seat and 4-seat match, undo and rematch.
- Bots: announce within range, match the announcement more often than a random player (arena).
- Web: score bar and picker unit tests; layout checks.

## Out of scope

Other individual Jass games.
