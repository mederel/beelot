# Design: play Klaverjas with the Amsterdam rules (US-213)

Issue: [#506](https://github.com/mederel/beelot/issues/506). US-214 (Rotterdams, #507) adds its trumping rule as an option of
the variant this story introduces.

## Problem

Klaverjas is the Netherlands' national card game, a close relative of Belote: same 32 cards, same card order and points,
but another way of choosing trumps, another trumping rule and its own bonuses (roem, pit, nat). Beelot cannot deal, play or
score it, so Dutch players cannot play their own game.

## Sources and the rule set chosen

The issue names [Pagat — Klaverjassen](https://www.pagat.com/jass/klaverjassen.html) and
[Wikipedia — Klaverjas](https://en.wikipedia.org/wiki/Klaverjas). **pagat.com could not be reached from the environment of
this change** (its name does not resolve); the rules were read on the English Wikipedia page and on the Dutch one,
[Klaverjassen](https://nl.wikipedia.org/wiki/Klaverjassen), which is the more detailed of the two. Where the pages leave a
choice to the players ("players must agree beforehand"), the choice made is stated below. Rules differ by region and club:
the rule set below, called "Beelot's Amsterdams", is the one implemented.

| Topic | Rule in Beelot |
| --- | --- |
| Players, cards | 4 players in 2 partnerships (North–South, East–West), the 32 cards from 7 to ace. |
| Deal | The player before the dealer cuts; the dealer deals 3, 2 then 3 cards to each player from the player after them (nl: "3-2-3 of 4-4"). Every card is dealt; none is turned up. |
| Card order, points | Trumps: J 20, 9 14, A 11, 10 10, K 4, Q 3, 8, 7. Other suits: A 11, 10 10, K 4, Q 3, J 2, 9, 8, 7. 152 in the cards and 10 for the last trick: 162. The same as Classic Belote. |
| Choosing trumps | One round, from the player after the dealer: each player either **plays**, naming the trump suit, or **passes**. The first to name a suit is the playing team ("spelende partij"); the auction ends. When the first three have passed, **the dealer must play** and names the trump suit. No redeal. This is the en.wikipedia method "the dealer chooses trumps and must play", without the turned-up card (a turned card is one of several methods the pages list; the free choice keeps all 32 cards in the hands). |
| Lead | The player after the dealer leads the first trick; the winner of a trick leads the next. |
| Following | A player must follow the suit led. When trumps are led, they must play a higher trump than the best one in the trick if they can, otherwise any trump. |
| Not able to follow (Amsterdams) | If the **partner is winning** the trick, the player may play any card. Otherwise they must trump; if a trump is already in the trick they must overtrump if they can. **Undertrumping is allowed only when unavoidable**: a player who cannot overtrump plays a card of another suit if they hold one, and a lower trump only when they hold nothing but trumps. A player without trumps plays any card. |
| Roem | Counted **in each trick**, from its four cards, for the team that wins the trick: three cards in sequence of one suit 20, four 50 (the sequence order is A K Q J 10 9 8 7, the "natural" order, also in trumps); four aces, tens, kings or queens 100, four jacks 200 (four nines, eights or sevens score nothing); **stuk**, the king and queen of trumps in the same trick, 20, added to a sequence that contains them. In the clubs players must claim their roem; Beelot counts it for them, so none is forgotten. |
| Last trick | 10 points. |
| Pit | The playing team that takes all eight tricks scores 100 roem extra ("pit" or "doormars"). No bonus for the opponents taking every trick ("tegenpit" varies by region): the playing team is then nat. |
| Nat | The playing team must score **more than half** of the round's points, card points, last trick and every roem of both teams counted. If it does not, it is **nat**: it scores 0, and the opponents score 162 and the roem of both teams. |
| Match | Clubs play 16 deals ("boompje") or to 1,500 points; Beelot plays to a target like every variant, and Klaverjas's default target is **1,500**. |

Out of scope, as the issue says: Rotterdams (US-214), drive (tournament) scoring, club competitions. Not offered either:
roem held in the hand ("roem in de hand"), the Leids auction, the turned-card method.

## How it plugs in

Klaverjas is a new `Variant::Klaverjas` (`"KLAVERJAS"` on the wire and in the database), "Klaverjas" in every language.

### `beelot-game`

- `BiddingState`: deals `[3, 2, 3]`, no upturned card. `choose_trump` and `pass` follow Bela's path (name a suit or pass,
  the dealer may not pass: `GameError::DealerMustChooseTrump`), but no cards are dealt after the call: the board is built
  from the eight-card hands with `GameBoard::from_klaverjas`.
- `rules`: a `Trumping` enum (`Belote`, `Amsterdams`; US-214 adds `Rotterdams`) and `legal_cards_with` /
  `illegal_reason_with` taking it; `legal_cards` and `illegal_reason` stay the Belote rule. The only change from Belote is the case "cannot follow, must trump, cannot overtrump", where Klaverjas gives the
  non-trump cards (when there are any) instead of the lower trumps. `illegal_reason` gains
  `IllegalReason::MayNotUndertrump` for a lower trump refused that way (`MAY_NOT_UNDERTRUMP` in the snapshot).
- `roem`: a new module, `roem::of_trick(cards, trump) -> Vec<Roem>` with a kind (`SEQUENCE_3`, `SEQUENCE_4`, `FOUR_OF_A_KIND`,
  `STUK`) and points, and `roem::points`.
- `GameBoard::from_klaverjas`: announcements off, no Belote (stuk is roem of the trick). After each trick the board adds
  the trick's roem to the winner's team (in the live score and in the team's roem total, kept in the existing
  `*_announcements` fields) and keeps the last trick's roem for the review.
- `scoring::score`: a Klaverjas branch for nat and pit. In the `RoundResult`, roem is reported in
  `north_south_announcements` / `east_west_announcements` (before nat moves it), the pit as `capot_team`, and `contract_made`
  is false when the team is nat.
- `match_score::default_target(Klaverjas)` is 1,500.
- Bots: the rule-based strategy plays (names its best suit) when the eight-card suit estimate reaches 100 (the jack with two
  more trumps and an ace; set by eye on `suit_estimate`, like Bela's); the dealer plays its best suit whatever its hand. Card
  play takes the engine's legal cards, so every bot plays legally. The Challenging bots' double-dummy search keeps the Belote
  trumping rule and does not count roem: it only weighs their choice among the legal cards (a later story can teach it).
- The arena takes `--variant klaverjas`.

### `beelot-table` and `beelot-server`

Everything keyed on a variant learns `KLAVERJAS`: the database code, the statistics (a fourth tally), the leaderboard, the
spectator snapshot test, the auction's opening line ("Eight cards have been dealt. Play, naming the trump suit, or pass.").
The table's announcements setting does not apply to Klaverjas (the board never offers in-hand announcements). The board
snapshot gains `trickRoem`, the points of roem of the trick under review (0 otherwise), and the illegal reason
`MAY_NOT_UNDERTRUMP`.

## Frontend

- The setup sheet, the public lobby, the leaderboard and the statistics list "Klaverjas"; its subtitle is "Dutch rules
  (Amsterdams), with roem and nat". The announcements switch is hidden for it, as for Bela.
- The auction uses Bela's panel (four suits and "Pass"); its title "Choose trumps or pass", the dealer's pass disabled with
  "The dealer must play: choose trumps". The deal is shown in three packets (`FIRST_DEAL_STEPS.KLAVERJAS = [3, 2, 3]`).
- A trick under review that holds roem shows a toast "Roem: {points} for {team}.".
- The round's breakdown for Klaverjas: "North–South: {cards} card points + {last} last trick + {roem} roem = {awarded}…",
  with "Pit!" and "Nat!" lines.
- A refused lower trump says "You may not undertrump: play a card of another suit.".
- The rules page has a Klaverjas section. New texts go through `t()` with French and Dutch; the Dutch uses the usual terms
  (troef, roem, stuk, nat, pit).
- Layout checks: the setup sheet with Klaverjas chosen and the Klaverjas auction are added to `e2e/key-screens.spec.ts`.

## Tests

- Rust: the deal (8 cards each, 3-2-3, no upturned card), the auction (the dealer cannot pass, the first suit ends it),
  the Amsterdam legal plays (partner winning frees the hand; must trump; must overtrump; no undertrump while holding another
  suit; undertrump when only trumps are held; the random check that `illegal_reason` and the legal cards agree), roem of a
  trick (each kind, stuk with a sequence, no roem for four nines), the scoring (made, nat, pit, roem moved by nat), the
  default target, the database code round trip, whole Klaverjas rounds and matches played by bots with the legality check.
- A **fixture**: one complete deal written card by card (`crates/beelot-game/tests/klaverjas.rs`), with every trick's
  winner, points and roem and the round's score worked out by hand from the two Wikipedia pages and checked against the
  engine. It is not a deal recorded from another program or club sheet: no such record was reachable, so this part of the
  criterion is met only against the written rules.
- Web: the setup form, the auction sheet, the reason text, the round breakdown, the fr/nl coverage tests.
- Docs: `pages/docs/klaverjas.html`, listed in every docs navigation and in the README.

## Not done

Rotterdams (US-214); roem in the hand; the double-dummy search under the Klaverjas rules; a recorded fixture from an
independent program.
