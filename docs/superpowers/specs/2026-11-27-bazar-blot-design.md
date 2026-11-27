# Design: play Armenian Belote (Bazar Blot) with an Armenian UI (US-216)

Issue: [#509](https://github.com/mederel/beelot/issues/509).

## Problem

Bazar Blot ("Բազար բլոտ") is the Belote of Armenia: the same 32 cards and card points, but the auction is a "bazar" of
suit-and-number bids ("Hearts-15": the team will take at least 150 points), declarations ("terz") with their own values,
contra and recontra, a kaput bid, and a score kept in tens of points ("sai") to 301. Beelot cannot play it, and its UI has
no Armenian.

## Sources and the rule set chosen

The issue names one source, a blog essay ([Avagyan, 2012](http://avagyanp.blogspot.com/2012/07/thearmenians-play-bazaar-blot-alongwith.html)):
it gives the bid form ("Diamonds-10", "Hearts-15"), the terms (terz, kapuyt) and "301 exactly", but no rules to play by.
Pagat and the English Wikipedia have no page for the game (both 404 from the environment of this change). Four rule pages
were read instead:

- **R** — [reblot.am, Bazar-Blot rules](https://reblot.am/rules.php?lang=en): the most complete, with the scoring formula.
  **The main source.**
- **A** — [bazarblot.am, Game rules](https://bazarblot.am/rules): an Armenian app's rules for beginners; gives the rounding.
- **C** — [Belote Club, Bazar Blot rules](https://home.belote.club/en/bazar-blot-rules).
- **T** — [terz.am, Rules](https://terz.am/rules.php?lang=en): short.

Where they agree, Beelot follows them; where they differ, R wins unless stated. The issue asks for a second source or a
native speaker's review: R, A and C are three independent sources that agree on the points, the auction and the
declarations; **a native speaker should still review the rules and the Armenian texts** (see "Not done").

The product owner chose, when asked during this change: the bid is made with **at least** bid × 10 (R, A; the issue's
"more than" followed the blog); the target is **chosen among 101, 151, 201 and 301**, 301 by default (R); no trumps
("Boy"), recontra and the kaput bid are in.

| Topic | Rule in Beelot | Sources |
| --- | --- | --- |
| Players, cards | 4 players in 2 partnerships, the 32 cards from 7 to ace. | all |
| Deal | The player before the dealer cuts; the dealer deals 3, 2, 3 cards to each player from the player after them. Every card is dealt before the auction; none is turned up. | R, A, C, T: 8 cards each, all before the auction (R: "all 8 cards at once"); the packets are Beelot's, as in Contrée. |
| Card order, points | Trumps: J 20, 9 14, A 11, 10 10, K 4, Q 3, 8, 7. Plain suits: A 11, 10 10, K 4, Q 3, J 2, 9, 8, 7. No trumps: A 19, 10 10, K 4, Q 3, J 2. 152 in the cards and 10 for the last trick: 162. | all agree (the Contrée values). |
| Bids | From the player after the dealer, each player in turn **bids**, **passes** or (see below) says **contra**. A bid is a number from **8 to 24** and a suit or **no trumps** ("Boy"): it promises at least number × 10 points. A bid must carry a higher number than the last one, whatever its suit; a player may raise their partner. A player who passed may bid later. | R, A, C, T (8 and up by 1); the cap of 24 is Beelot's (just below kaput). |
| Kaput bid | A bid of **kaput** (25) in a suit or no trumps promises every trick. It beats every number; after it nobody can bid, only pass or say contra. | R, A, C, T (25); R lets a higher kaput follow, Beelot keeps one kaput bid. |
| End of the auction | Three passes after a bid end it; the highest bid is the contract. If all four pass without a bid, the cards are gathered and the next player deals. | R, A count "4 passes" from the opening; T redeals on four passes; three passes after the last bid is Contrée's rule. |
| Contra, recontra | An opponent of the highest bidder may say **contra** on their turn: the bidding stops. Then the bidding team, in turn (the player after the one who said contra, then their partner), may say **recontra** or pass; recontra or two passes end the auction. | R (only the bidding team may answer), A, T. |
| Declarations ("terz") | When the table plays with announcements (on by default, as in Contrée): three cards in sequence of one suit 20 ("terz"), four 50, five or more 100; four of a kind in a suit contract: J 200, 9 140, A 110, 10, K, Q 100; under no trumps: A 190, J, 10, K, Q 100 (nines, eights and sevens nothing). Declared with the first card, shown after the first trick. | R and C agree on every value; A gives them in tens. |
| Which declarations score | Only the team holding the strongest declaration scores, every one of its own. Strongest: the higher value; at an equal value, four of a kind beats a sequence; then the higher top card (four of a kind: J > 9 > A > 10 > K > Q in a suit contract, A > 10 > K > Q > J under no trumps; sequences A > K > … > 9); then a sequence in trumps; then the first to declare. | R; C ("the biggest declaration"); A. |
| Blot | The king and queen of trumps held by one player: 20 points ("blot, reblot") when the second is played. Always kept by its team, and counted for the bid. None under no trumps. | R ("always counted"), A, C. |
| Play | Belote's: follow the suit led; when trumps are led, overtrump if possible; a player who cannot follow must trump, and overtrump if possible, unless their partner is winning the trick. Under no trumps, follow suit or play any card. | R (with the partner exception), A, C; T differs on the partner. |
| Lead | The player after the dealer leads the first trick; the winner of a trick leads the next. | R, T. |
| Making the bid | The bidding team's card points, last trick, scored declarations and blot must reach **at least** bid × 10. A team taking every trick counts 252 (162 and 90 for kaput). A kaput bid is made only by taking every trick. | R, A (at least); C. |
| Score of a deal | In tens, "sai": a team's card points and last trick divided by 10, **a half rounding down** (112 → 11, 115 → 11, 116 → 12). The deal is worth **16**, or **25** when one team takes every trick (kaput). Declarations and blot count a tenth of their points. The bid counts bid × multiplier, the multiplier being 1 in a suit, 2 under no trumps; 2 and 3 with contra; 4 and 5 with recontra. **Made**: the bidding team scores bid × multiplier + 16 − the defence's sai + its declarations and blot; the defence its sai, declarations and blot. **Made with contra or recontra**: the bidding team scores bid × multiplier + 16 + every scored declaration + its blot; the defence its blot only. **Failed**: the bidding team scores its blot only; the defence bid × multiplier + 16 + every scored declaration + its blot. With a kaput, 25 replaces 16 (and the kaput team's opponents have no sai). | R (formula, multipliers, 25), A (rounding), C (+90 for a kaput). |
| Match | Played to **101, 151, 201 or 301** (default 301), chosen at the table; the first team to reach the target wins; when both reach it in the same deal the higher score wins, an exact tie plays another deal. The blog's "301 exactly" is read as the target, 301: no source describes a rule that a team must land on the target exactly. | R (targets), A (one more round on a tie), blog. |

## How it plugs in

Bazar Blot is a new `Variant::BazarBlot` (`"BAZAR_BLOT"` on the wire and in the database), "Bazar Blot" in every
language. Scores of the match are in sai, so its targets are smaller than the other variants' (1,000 for Classic).

### `beelot-game`

- `card.rs`: the variant, 4 seats, `has_hints() == false` (the hints' search and the round's analysis score Belote,
  not sai).
- `bidding.rs`: the 3-2-3 deal; `bid` accepts Bazar bids (8..=24 or 25 for kaput, in a suit or no trumps, higher number
  than the last); `coinche` is the contra (`can_coinche` true for an opponent of the bidder in Bazar Blot); a new
  `recontra` call (`CallType::Recontra`, `AuctionDecision::Recontra`, `can_recontra`) for the bidding team after a contra;
  `AuctionView` gains `recontra_allowed` (serde default false, for the recorded fixtures). The board is built with
  `GameBoard::from_bazar_blot(hands, trump, declarer, bid, contra, dealer, announcements)` where `contra` is a
  `Contra` level (`None`, `Contra`, `Recontra`).
- `announcements.rs`: `find_for(variant, hand, trump)` with the Armenian four-of-a-kind values and
  `best_seat_for(variant, …)` with the Armenian order (four of a kind before a sequence of the same value); the Belote
  functions are unchanged.
- `scoring.rs`: `score_bazar_blot`, with `sai` (a half rounds down) and the formulas above. `Totals` gains `recontra`.
  The `RoundResult`'s `*_awarded` and `*_bid` are in sai (the bid as bid × multiplier, for the team that won it), the card
  points, last trick, declarations and blot stay in points for the breakdown; `capot_team` is the team that took every
  trick; `RoundSummary.contract_value` is the bid and `coinched` is set for contra and recontra, with
  `RoundSummary.recontra` (serde default false).
- `match_score.rs`: `targets(variant)` (`BAZAR_BLOT_TARGETS = [101, 151, 201, 301]`, else `TARGETS`),
  `default_target(BazarBlot) == 301`, `MatchScore::to` accepts both lists.
- Bots (`rule_based.rs`): the Contrée estimate on a tenth scale over the four suits and no trumps (no all trumps), the
  partner raise, contra when the Contrée coinche test holds against bid × 10, recontra when the bidder's own estimate
  beats the bid by 20 points; no kaput bid. Card play is Contrée's (legal cards from the engine).
- Arena: `--variant bazar-blot`.
- Fixtures: `fixtures/deals-bazar-blot.jsonl`, deals recorded with the rule-based bots by an ignored `record` test, and a
  replay test, as for Bulgarian (`fixtures/SOURCE`). A hand-worked deal in `tests/bazar_blot.rs` checks the scoring.

### `beelot-table` and `beelot-server`

- `Action::Recontra`, its route and its bot path; the refusal `RECONTRA_NOT_ALLOWED`; messages "Contra!", "Recontra!",
  "{name} says contra.", "{name} says recontra." for Bazar Blot (Contrée keeps "Coinche!"), the auction's opening line.
- The lobby checks the target against `targets(variant)`; the database code, statistics, leaderboard and the tests that
  list the variants learn `BAZAR_BLOT`. The snapshot gains `recontraAllowed` and `recontra`. The history stores a recontra
  as coinched (the points are right; the level is not kept).

## Frontend

- Types, setup sheet ("Bazar Blot", subtitle "Armenian rules: bid tens of points, contra and kaput"), lobbies,
  leaderboard, stats. The target picker offers `targetsOf(variant)`: 101, 151, 201, 301 for Bazar Blot.
- The auction sheet: the numbers 8 to 24 and "Kaput", the four suits and no trumps, "Contra" (in place of Coinche) and
  "Recontra"; the calls read "Hearts 10", "Kaput", "Contra!", "Recontra!".
- The round breakdown for Bazar Blot, in sai: "{team}: bid {bid} + tricks {tricks} + declarations {declarations} =
  {awarded}", with "Kaput!" and "Contract failed".
- The rules page has a Bazar Blot section. `pages/docs/bazar-blot.html`, listed in the docs navigations and the README.

### Armenian (`hy`)

- `src/lib/i18n/hy.ts`, every text of the catalogue in Eastern Armenian (Armenian script); `hy` in the language choice
  ("Հայերեն"), in `types.ts`, `i18n.svelte.ts`, the coverage and message-code tests and their fixtures.
- Fonts: Geist and Bricolage have no Armenian glyphs. Noto Sans Armenian (`@fontsource-variable/noto-sans-armenian`,
  SIL OFL, served by the site like the others) is declared for both families with the Armenian `unicode-range`
  (U+0530–058F, U+FB13–FB17). A test checks that every character of `hy.ts` falls in a declared range.
- Layout checks: the long-text checks of `e2e/extremes.spec.ts` run with Armenian as they do with Bulgarian, and the
  setup sheet with Bazar Blot chosen joins `e2e/key-screens.spec.ts`.

## Tests

- Rust: the deal; the auction (the range, higher numbers only, kaput ends the bidding, three passes, four passes redeal,
  contra by the opponents only, recontra by the bidding team only, two passes after contra); declarations (values, four
  of a kind beating a 100 sequence); `sai` rounding; scoring (made, made with contra, recontra, failed, kaput, no trumps
  multiplier, blot kept); targets; bot rounds and matches with the legality check; the fixture replay; the database code.
- Web: setup form, auction sheet, round breakdown, i18n coverage for `hy`, the font range test.

## Not done

- A native speaker's review of the rules and of the Armenian texts (machine-quality translation by the author of this
  change).
- R's match rules: a reverse kaput ("t'ars kaput") losing the match, a team failing its bid not winning by that deal, a
  kaput not ending the match unless contra'd; a kaput bid overcalled by a higher kaput.
- The hints and the analysis of a round for Bazar Blot; a fixture recorded from another program.
- Regional house rules (out of scope in the issue).
