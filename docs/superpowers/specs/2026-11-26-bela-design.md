# Design: play Bela (Croatia, Bosnia, Serbia) with a Croatian UI (US-218)

Issue: [#511](https://github.com/mederel/beelot/issues/511).

## Problem

Players from Croatia, Bosnia and Serbia play *Bela* (also *Belot*): a close cousin of Classic Belote with another auction
and its own declarations ("zvanje"). Beelot has no way to deal, bid or score it, and no Croatian text.

## Decisions

### Which game "Bela" is

Picking **Bela** gives the Balkan game described here: four players, two partnerships, 32 cards, 8 tricks. It is **not**
Klaberjass (US-219), which some call "Bela" too (Klaberjass is a two-player game with a different deck use and scoring);
that variant, when it arrives, gets its own name and its own `Variant`. The lobby, the leaderboard and the rules page all
say "Bela" for this game only.

### Rule set (the one implemented)

Source: the Bosnian page of Pagat (`pagat.com/national/bosnia.html`) and the Croatian guide on igre.games, as the issue
names them. **The environment of this change could not reach either site (the network proxy refuses both hosts), so
the rules below are written from the game's common rules and not checked line by line against those pages.** The issue asks to
confirm with a Croatian-language rulebook: the points marked ⚠ are the ones to confirm.

| Topic | Rule in Beelot |
| --- | --- |
| Players, cards | 4 players in 2 partnerships, the 32 cards (7 to ace). Same card points as Classic Belote: trump J 20, 9 14, A 11, 10 10, K 4, Q 3; plain A 11, 10 10, K 4, Q 3, J 2; 162 in the cards. |
| Deal | The dealer deals 3 then 3 cards to each player from the player after them (6 cards), then, once trumps are named, 2 more each (8). No card is turned up. |
| Auction | One round, from the player after the dealer. Each player either **names the trump suit** ("zove") or passes (**"dalje"**). The first to name a suit is the caller; the auction ends. The **dealer may not pass**: if the other three said "dalje" the dealer must name a suit. No redeal. ⚠ Some tables let the dealer's team take it with the "hold" rule; not played. |
| Play | The player after the dealer leads. Follow suit; overtrump when you can; a player who cannot follow must trump, unless the partner is winning (the engine's existing rule for suit contracts). ⚠ Some Bela tables oblige trumping even over a partner; to confirm. |
| Zvanje (declarations) | Sequences of 3 (tierce) 20, 4 50, 5 or more 100; four jacks 200, four nines 150, four aces, tens, kings or queens 100. They are called with the first card played; only the team holding the best declaration scores its declarations (the engine's announcements, always on in Bela). **Bela**: king and queen of trumps, 20, called with the second card. |
| Last trick | 10 points ("zadnji štih"), as the dix de der. |
| Scoring | The caller's team must score more than the opponents (more than half of the round's points, declarations counted). If it does not, it is **"pad"**: the opponents score all 162 points and every declaration; the caller's team keeps its bela. A team that takes all 8 tricks makes **"štiglja"**: 90 extra points (162 + 90 = 252 instead of Classic's 250). |
| Match | Played to 1,001 in tradition; Beelot offers 500, 1,000, 1,500 and 2,000 for every variant, so the default is **1,000** (the same as Classic). |

### Two and three players

The issue offers them "if the chosen rule source defines them". The two sources do not define them fully (the issue says
so itself: no authoritative two-player rule set was found). **They are not offered in this story**; the lobby stays at four
seats. A follow-up story can add them once a Croatian rulebook confirms the rules (3 + 3 cards, an upturned card, a talon,
a discard of 2).

### How it plugs in

Bela is a new `Variant::Bela` (`"BELA"` on the wire and in the database) that reuses the Classic round:

- `BiddingState` deals 3 + 3, accepts `Trump { suit }` or `Pass` from the active seat, refuses a dealer's pass
  (`GameError::DealerMustChooseTrump`, code `dealer-must-choose-trump`), then deals 2 + 2 + 2 + 2 and builds a `GameBoard`
  with announcements on (`GameBoard::from_bela`).
- `scoring::score` takes the capot's bonus from the variant: 250 in Classic and Contrée, 252 in Bela.
- Bots: the rule-based strategy names its best suit when the six-card estimate reaches a threshold and the dealer names the
  best suit whatever its hand. The threshold is fitted by eye on the existing suit estimate, not by the arena (the arena
  can now play Bela with `--variant bela`, so it can be fitted later).
- Everything keyed on a variant (database code, statistics, leaderboard, arena, lobby, setup, messages) learns `BELA`.

### Locales: Croatian, Serbian, Bosnian

`hr` is added as a language (English text as key, a dictionary loaded on demand like `fr` and `nl`, Croatian suit and card
names: *tref, karo, herc, pik*; *As, Kralj, Dama, Dečko/Žandar*, labels A K D J). It translates the screens a Bela player
uses (home, setup, the auction, the table, the rules, the settings); a text it does not have falls back to English, the
mechanism every language has. The fr/nl coverage tests stay as they are; a test checks `hr`'s Bela texts.

**Decision on Serbian and Bosnian: no `sr` and no `bs` locale in this story.**
- **Bosnian** (Latin script) and **Croatian** share the grammar, the card words and the game's terms (*zvati*, *dalje*,
  *bela*, *štih*, *adut*, *zvanje*) apart from a few spellings (*tisuća*/*hiljada*, *točka*/*tačka*, *glazba*/*muzika*). `hr` serves
  them.
- **Serbian** has a Latin form that reads like Croatian, and a Cyrillic form. Cyrillic needs another script, other fonts to
  check in the layout tests and a transliteration that is not mechanical for card words (*žandar*, *baba*), so it is
  its own story. Until then Serbian players read `hr` (Latin).
- The language list is a table in `i18n.svelte.ts`: adding `bs` or `sr` later means one dictionary and one line. A browser
  language of `bs` or `sr-Latn` is not auto-detected (French stays the default, as for every language: the choice is in Settings).

## Frontend

- The setup sheet, the public lobby, the leaderboard and the statistics list "Bela" as a third variant; its subtitle is
  "Name the trump or say dalje (pass)".
- The auction panel for Bela shows four suit buttons and "Dalje" (pass); the dealer's pass is disabled with the reason.
  The first deal shows 6 cards, then 2 more once trumps are named (`FIRST_DEAL_STEPS.BELA = [3, 3]`).
- The rules page has a Bela section. New texts go through `t()` with French and Dutch (and Croatian).
- Layout checks: the setup sheet with the three variants and the Bela auction are added to `e2e/key-screens.spec.ts`.

## Tests

- Rust: the auction (dealer cannot pass, first suit ends it, 6 then 8 cards), the board (announcements on, belote), the capot of
  252, `default_target`, the database code round trip, the bots playing whole Bela rounds and matches (bot_play).
- Web: the variant model (setup form, target, auction sheet), the Croatian locale, the coverage tests.
- Docs: `pages/docs/` gets a Bela page.

## Not done

- Two- and three-player Bela; Serbian Cyrillic and a Serbian locale; the arena-fitted bot threshold; the ⚠ rules above.
