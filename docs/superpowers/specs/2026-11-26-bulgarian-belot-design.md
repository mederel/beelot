# US-215 — Bulgarian Belot (bridge-belote) with a Bulgarian UI

Issue: #508. Out of scope: other Balkan variants (US-218).

## Rule source — and its limits

The two sources named in the issue (Playbelot.bg's history of Belot, Wikipedia's *Belote*) could not be fetched from
the build container (network allow-list). A web search reached belot.bg's rules (4 players, two teams, 32 cards,
tournaments to 151) and general Belote sources (pagat.com). The rules below are therefore the **common core of
Bulgarian belot** as those sources describe it plus the usual local practice; **they must be checked with a
Bulgarian player before release** (the issue already says so). Choices that rest on practice, not on a fetched source,
are marked *(to verify)*.

## Rule set chosen

Bulgarian belot is played by two teams of two with 32 cards.

- **Deal**: 3 + 2 + 3 cards to each player, as in Contrée; the player after the dealer speaks first.
- **Bidding** (no upturned card): each player passes or bids a game. Games rank
  clubs < diamonds < hearts < spades < no trumps < all trumps. A bid must be higher than the last. The auction ends after
  three passes following a bid; four passes redeal with the deal passing on. *(order to verify)*
- **Card ranks differ by game**: in a suit game the trump suit ranks J, 9, A, 10, K, Q, 8, 7 (20, 14, 11, 10, 4, 3, 0, 0)
  and other suits A, 10, K, Q, J, 9, 8, 7; in no trumps every suit ranks as a plain suit (the ace is worth 11 and the
  jack 2); in all trumps every suit ranks as trump. This is the engine's existing rule for `Trump` and is reused.
- **Scoring**: the engine's existing tables are used for every game, so a round is worth 162 points of cards (the
  traditional 152 for all trumps and 130 for no trumps are *not* reproduced) *(to verify)*. The declaring team **makes**
  its contract when it has *more* points than the defence (Classic's rule); otherwise it is **inside** (вътре): the
  defence scores every point, 162 plus announcements, and the declaring team keeps only its Belote. A capot scores 250.
  Announcements and Belote are those of Classic Belote and are optional, as everywhere in Beelot.
- **Match**: to 1,000 like Classic (the existing target choices apply; the traditional 151 tournament target is not
  one of the engine's targets and is not added here). *(to verify)*
- **No contra / re-contra**: the issue's acceptance criteria do not ask for them; they are left to a follow-up.
- **Two-player version**: *not delivered in this change.* It needs a two-seat table and a drawing stock, which the
  engine's four-seat model has no room for. It is split off as a follow-up story, and the acceptance criterion stays
  open until then.

## Design

- `Variant::Bulgarian` (JSON `BULGARIAN`). Contrée's auction machinery is reused with ordinal bids: a `Bid` call's
  `value` is the game's rank 1..6 and its `trump` the game; `all_trumps` is always on. `coinche` is refused.
- `scoring`: only `Variant::Contree` takes the bid-value path, so Bulgarian follows Classic's scoring; the table
  announces "inside" for a failed contract through the existing "contract failed" text.
- Bots: a Bulgarian bid uses `contract_estimate` for each game and bids the best that outranks the current bid when the
  estimate reaches a threshold; it passes otherwise. Card play is unchanged (the rules already handle every `Trump`).
- Persistence: `BULGARIAN` joins `CLASSIC` and `CONTREE` in `matches.variant`, statistics and the leaderboard.
- **UI language `bg`**: `Language` gains `"bg"`, `bg.ts` translates every key of `fr.ts`/`nl.ts` and the server's
  message codes, the picker lists `Български`. Not translated, and left in English: the privacy policy, the server's
  pseudonyms and invitation pages (`Accept-Language: bg` is not recognised yet). The variant's terms use the usual vocabulary:
  белот, коз, без коз, всичко коз, вътре, обява, пас, терца, кариета.
- Layout: `e2e/extremes.spec.ts` runs Bulgarian with the other languages (Cyrillic is wider).
- Fixtures: one recorded Bulgarian deal in `fixtures/`.

## Tests

Bidding order and rejection of lower bids; four passes redeal; scoring inside / made / capot; bots play legal cards over
many seeds; the i18n coverage test requires `bg` for every text; the Rust language negotiation; the e2e extremes.
