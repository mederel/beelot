# Design: Moroccan Belote, research and rules (US-223)

Issue: [#516](https://github.com/mederel/beelot/issues/516). Implementation story: US-225 (opened with this spec).

## Status of this document

This is a research story. Its deliverable is what is known, what is not, and a decision on how to build it. **It does not
claim to be the complete Moroccan rulebook.** Every rule below carries one of three marks:

- **Sourced**: a source states it (named in the table of sources).
- **Partly sourced**: a source states it, but only as read through a search-engine summary, or the source describes
  another country's game.
- **Unknown**: nothing found. Not guessed. The implementation story starts by settling these with Moroccan players.

### What blocked the research

The environment's network blocks the hosts that matter most: `rasderb.com` and `touti.ma` could not be fetched
(`getaddrinfo ENOTFOUND`), and `en.wikipedia.org` was also not read. Everything attributed to those two Moroccan sites
comes from **search-result summaries only**, not from reading their pages. The acceptance criterion "at least two
independent sources, one Moroccan" is therefore **only partly met**: see the table. No player was interviewed (a
sandboxed session cannot do it); that task is moved to US-225.

## Sources

| # | Source | Kind | Used for | Read how |
| --- | --- | --- | --- | --- |
| S1 | rasderb.com, "قواعد البلوت" (`/ar/rules/belote`), a page in Arabic on Moroccan Belote | Moroccan-language rulebook | bidding words, trump values, 162, capot, failed contract | search summary only (host blocked) |
| S2 | touti.ma, "Règles du jeu" (a Moroccan card-game site that says "belote marocaine" can be played) | Moroccan site, in French | its own game's announcements ("Ghna") | search summary only (host blocked); it describes the Touti game, not necessarily belote |
| S3 | pagat.com, Belote and Baloot pages | Independent reference | classic rules; Gulf Baloot, a close relative | search summary only |
| S4 | pagat.com, "Card games in Morocco", and World of Playing Cards, "Playing cards in Morocco" | Independent reference | which pack is common in Morocco | search summary only |
| S5 | French federation rules (ffbelote.org) and other French sites | Classic Belote | the baseline to compare with | search summary only |

Independence: S1 and S3/S5 are independent of each other. S2 is independent but says nothing confirmed about belote
rules. The only source that treats Moroccan Belote rules in any detail is S1: **one Moroccan source, not two**.

## What the sources say about Moroccan Belote

| Topic | Moroccan Belote | Mark | Source |
| --- | --- | --- | --- |
| Players, teams | 4 players, 2 teams of partners opposite | Partly sourced (general to all belotes) | S1, S3 |
| Pack | 32 cards, 7 to ace (7, 8, 9, 10, jack, queen, king, ace) | Sourced | S1 |
| Pack, local note | The common Moroccan pack is a 40-card Spanish-suited one (the "كارطة"). Whether Moroccan Belote is played with it or with a French 32-card pack is **unknown**; S1 describes 32 cards | Unknown | S4 |
| Direction of play | Counter-clockwise | Sourced | S1 |
| Bidding | One turned-up card; each player in turn takes it ("تاخذ") or passes ("تجوز"). The taker becomes "الآخذ" and the suit is trump | Sourced | S1 |
| Bidding, second round | Whether a second round exists (any other suit) when all pass: **unknown** | Unknown | none |
| Contre / surcontre (coinche) | Not mentioned: **unknown** | Unknown | none |
| Cards dealt | Unknown for Morocco. French Belote deals 3+2 then the rest (the taker gets 3 more, the others 2); Gulf Baloot deals 3, 2, then 1 turned up | Unknown | S3, S5 |
| Trump order and values | Jack 20, nine 14, then as in classic Belote | Sourced (values); order partly | S1 |
| Plain suits | Ace 11, ten 10, king 4, queen 3, jack 2 (as classic) | Partly sourced | S1, S5 |
| Total per deal | 162 points in the cards (the same total as classic) | Sourced | S1 |
| Game target | 1000 by default | Sourced | S1 |
| Following suit, trumping | Follow the suit led, else trump | Partly sourced (general) | S3 |
| Belote-rebelote | King + queen of trump, called "بلوت" then "ريبلوت". A summary gives the value as 2 points; classic is 20 | Unknown (value) | S1 |
| Announcements | Sequences of three or more in a suit and four of a kind give extra points, declared during play. Which sequences, which values, which fours: **unknown** | Partly sourced | S1 |
| Capot | Taking all eight tricks, "الكابو": 252 instead of 162 | Sourced | S1 |
| Failed contract | If the taker's team does not beat the opponents, the opponents score all 162 | Sourced | S1 |
| Last trick (dix de der) | Unknown | Unknown | none |
| Rounding of scores | Unknown | Unknown | none |

## Differences from classic Belote and Coinche

Beelot's two variants are `Variant::Classic` (Belote: take-or-pass in two rounds, no contract number) and
`Variant::Contree` (coinche: numbered contract, contre, surcontre).

| | Classic | Contrée | Moroccan (as far as known) |
| --- | --- | --- | --- |
| Deck | 32 | 32 | 32 per S1; the pack in common use is 40 Spanish cards (unknown) |
| Bidding | take or pass, two rounds | numbered contracts + coinche | take ("تاخذ") or pass ("تجوز") on the turned-up card; closer to Classic |
| Declarations | optional | optional | sequences and fours, values unknown |
| Belote-rebelote | 20 | 20 | called "بلوت / ريبلوت", value unknown (2?) |
| Scoring | 162 + 10 last trick, capot 252, game to 1000 or 501 | contract points | 162, capot 252, failed contract gives 162 to the opponents, game to 1000 |
| Direction | clockwise | clockwise | counter-clockwise |

Close relative: Gulf **Baloot** (S3) also has "Sun" and "Hokm", doubling and 152-point games. None of that is
attributed to Morocco here, and it must not be copied in without a Moroccan source.

## Decision: a rule option of Classic, not a new `Variant`

**Moroccan Belote is configured as a set of options on `Variant::Classic`, not as a third `Variant`.**

Reasons:

1. What is known (take-or-pass on one card, trump jack 20 and nine 14, 162 per deal, capot 252, game to 1000) is the Classic
   skeleton. The differences are options: play direction, belote value, failed-contract rule, announcement table.
2. A new `Variant` forks the table, bots, scoring, review and the arena for rules that are mostly shared. The bots' benchmark
   (US-211) would double.
3. The unknowns (second round, deal size, announcements) are options too. If players show that the game has a different
   bidding structure, the decision can be revised: a `Variant` can still be added later, whereas removing one is a breaking change.

If US-225 finds a bidding structure or pack that Classic cannot express (for example a 40-card deck with a different
trick count), it must say so and ask for a new `Variant` in its own design, instead of bending the options.

## Terms at the table (for US-224, Arabic UI)

Only terms found in a source are marked "sourced". The rest are **proposals to confirm with a Moroccan player**, because a
UI must not teach players words they do not use. Darija spelling varies; the forms below are the ones seen.

| French | Moroccan Arabic (Darija / Arabic script) | Mark |
| --- | --- | --- |
| prendre (take the turned-up card) | تاخذ (*takhod*) | sourced (S1) |
| passer | تجوز (*tjouz*) | sourced (S1) |
| le preneur | الآخذ (*l-akhed*) | sourced (S1) |
| atout (trump) | الأتو (*l-atou*) | sourced (S1) |
| la belote (king+queen of trump) | بلوت (*belot*) | sourced (S1) |
| la rebelote | ريبلوت (*rebelot*) | sourced (S1) |
| capot (all tricks) | الكابو (*l-kapo*) | sourced (S1) |
| le pli | الأكلة (*l-akla*), plural الأكلات | sourced (S1) |
| annonces (sequences, fours) | المشاريع (*l-machari3*) is the Gulf word; the Moroccan word is unknown. S2 mentions "Ghna" for its own game | unknown |
| jack, queen, king, ace | الولد (*l-weld*), البنت (*l-bent*), الشايب (*ech-chayeb*), الآس (*l-as*) | sourced for jack/queen/king/ace (S1) |
| ten, nine, eight, seven | العشرة, التسعة, الثمانية, السبعة (numerals) | sourced (S1, numerals) |
| carreau, coeur, pique, trèfle | not found; Spanish-pack suit names (oros, copas, espadas, bastos) are likely in use with that pack | unknown |
| donneur (dealer), couper (cut) | not found | unknown |
| contre / coinche | not found | unknown |
| équipe, partenaire | not found | unknown |

In French, the table words in Moroccan use are the French ones (belote, rebelote, atout, capot, contre, pli). Moroccan
players mix French and Darija, so the Arabic UI should accept both: show the Arabic term with the French one in brackets
where the player may know only that one. US-224 should confirm each term with a player before shipping it.

## Open questions, for US-225's first task

1. Which pack: 32-card French or 40-card Spanish, and which cards are removed?
2. How many cards are dealt, in which steps, and what happens to the turned-up card?
3. Is there a second bidding round, and a contre?
4. Belote-rebelote: 20 or 2? Is there a "rebelote" call that is mandatory?
5. Announcements: which sequences and fours, which values, who may declare, and when?
6. Last trick bonus and rounding of the deal's score.
7. Is the game to 1000 always, or agreed per table?
8. Interview two or three Moroccan players, and read S1 and S2 in full from a machine that can reach them.

## Out of scope

Any code, any UI text, any change to the bots. US-225 implements; US-224 localises.
