# Design: play Coiffeur Jass (US-221)

Issue: [#514](https://github.com/mederel/beelot/issues/514). Depends on US-220 (Schieber, #513): Coiffeur reuses its
36-card deck, its trick rules (trump, Obenabe, Undenufe), its Swiss card faces and its `de`/`it` locales. This design
names the Schieber items it builds on by their role; the plan resolves them to code once US-220 is on `main`.

Source: [Pagat — Coiffeur-Schieber Jass](https://www.pagat.com/jass/coiffeur.html), read on 2026-11-26.

## Problem

Swiss players use Schieber's cards and tricks for Coiffeur, a session in which each side plays every contract once and
keeps score on a slate. Beelot has no session longer than a match to a target.

## The source's player count

The issue's note asked to check the count, because one summary called Coiffeur a three-player game. Pagat describes
**two** forms and calls the second the better known in Switzerland:

- **Three players**: each plays alone against the other two, thirty hands, ten contracts each, scored in "sticks and
  potatoes" (the highest result of a row wins sticks, the lowest potatoes).
- **Four players**: "normally played with fixed partnerships", **eight** contracts per team, sixteen deals, with no sticks
  and potatoes: the team that chose the contract counts its points, divided by ten (units ignored) and multiplied by the
  contract's factor. It can also be played all against all. Pagat adds that "it is possible to include Slalom and Gustav in
  the four player game, with appropriate multipliers. This makes the game that much longer."

## Decision

Beelot's tables seat four in two partnerships, and the story asks for ten contracts and a slate per team. Coiffeur is
therefore the **four-player partnership game with the ten contracts** (Pagat's four-player rules plus the Slalom and Gustav
it allows): **twenty deals**, each team plays each of its ten contracts once. The three-player game and the all-against-all
game are out of scope (the sticks-and-potatoes scoring is only for three players).

### Contracts and factors

Ten rows in three sections, as on Pagat's slate (the thick lines of the slate mark the sections). The four-player factors
are Pagat's table; the two rows it leaves out are given the next factors, which is this design's choice (Pagat says
"appropriate multipliers" without naming them) and sits in one table, `COIFFEUR_FACTORS`, so a change is one line.

| Section | Contract | Factor |
| --- | --- | --- |
| Suits | Acorns (Eicheln) | 1 |
| | Flowers (Rosen) | 2 |
| | Shields (Schilten) | 3 |
| | Bells (Schellen) | 4 |
| No trump | Obenabe | 5 |
| | Undenufe | 6 |
| | Slalom | 7 |
| Gustav and jokers | Gustav | 8 |
| | Joker 1 | 9 |
| | Joker 2 | 10 |

Pagat lists the four suits as acorns, flowers, shields, bells with factors 1 to 4 and the two jokers at 7 and 8 in the
eight-contract game; with Slalom and Gustav in, the order of the slate (suits, no trump, Gustav and jokers) gives the
factors above. The correspondence of the four Swiss suits to the French ones (for a table that shows French faces) is the one US-220 defines
for its card faces; the factor follows the Swiss suit, so either faces score the same.

### The deal's play

- **Suit contract**: the trump rules of Schieber (trump Under = Puur, then the Nine = Näll; may trump when able to follow;
  never forced to play the Puur alone).
- **Obenabe / Undenufe**: Schieber's rules; the eights count 8 points each (157 points in the pack).
- **Slalom**: no trump; trick 1 is played in the order the declarer chooses (Obenabe or Undenufe), then the order flips each
  trick. The declarer chooses at the same moment as the contract.
- **Gustav** (Mittendurch): no trump; the first six tricks in one order and the last six in the other. The declarer chooses
  which order comes first.
- **Joker**: the declarer plays any of the other eight contracts (suit, Obenabe, Undenufe, Slalom, Gustav) and says before
  play whether it is written in the first or second joker row. A joker row, once used, is closed.
- Weis and Stöck are **not** played in Coiffeur: Pagat's description has neither, and the factors are made for the card
  points. (Schieber's setup option for them does not apply.)
- Last trick +5, "match" (all twelve tricks) +100 as in Schieber: 257 points.

### Scoring

For a deal, the team that chose the contract (the declarers) counts its card points, plus 5 for the last trick, plus 100 for
a match. Its slate cell holds `floor(points / 10) × factor`. Pagat's examples: Bells with 129 points writes 12 × 4 = 48;
a team that takes all twelve tricks (257 points) writes 25 × 4 = 100.

Pagat's second example says that when the *other* team makes match in Bells "they score 25 × 4 = 100". The source does not
say where they write it, so this design fixes one reading: **the declarers' cell is consumed and holds 0, and the
defenders add `25 × factor` to their total on a separate "Match against" line of the slate** (not in a row, so the
defenders' own contract rows stay free). In every other case the defenders write nothing for a deal they did not choose.

Session end: after twenty deals (both columns full), the team with the larger total wins; equal totals are a draw. The
winner shows by how much.

### The choice of contract

Pagat: forehand (the player to the dealer's right) chooses an available contract or passes; the choice passes
anticlockwise; if all four pass, forehand is "in the barrel" and must choose. A team whose column is full passes
throughout. A contract is available to a team when its cell is empty (a joker is available while one joker row is empty).

This is Schieber's "schieben" generalised: where Schieber lets the bidder pass the choice to the partner only, Coiffeur's pass
goes to the next player, as Pagat says. The table asks the player whose turn it is to choose a contract (and Slalom/Gustav
order, or the joker's contract and row) or to pass.

### The engine

- `Variant::Coiffeur`, in `beelot-game`: `Contract` (ten rows + the joker's inner contract), `Slate` (two columns of ten
  optional cells, with `available(team)`), `factor(contract)`, `score(contract, points, match)`.
- Trick order per trick for Slalom and Gustav: a function `order_for_trick(contract, first_order, trick_index) -> Order` so
  the Schieber engine's ranking takes it in place of its fixed Obenabe/Undenufe flag.
- Table (`beelot-table`): the lobby option is the variant; the session state adds the slate, the dealer and forehand's
  rotation, the barrel rule and the end of session. A deal ends by writing a cell; the session ends after twenty deals.
- The slate is serialised in the table snapshot (and to the replay/undo, which restore it).

### The bots

A bot team plays only contracts left on its slate:
- **Choosing**: for each available contract the bot estimates its points (the existing hand evaluators of Schieber, run on
  the 9-card hand for each possible trump and for Obenabe/Undenufe) and takes the contract with the largest expected cell
  (`floor(expected / 10) × factor`) **minus the cell's alternative value**: a weak hand goes to the lowest-factor open row
  (a poor hand costs least in Acorns), a strong hand (expected ≥ 100) goes to a joker. Forehand never passes without a
  contract; the other seats pass unless their best expected cell clears a threshold of the average cell.
- **Playing** a contract uses Schieber's bot play with the trick's order.

### The UI

- The table screen shows a **slate**: a table with one row per contract (name, factor) and two columns, "Us" and "Them",
  each cell empty, filled, or struck (match against), and a totals row. The three sections are separated by a thicker rule.
  The current contract's row is highlighted.
- **375×667**: the slate is a compact table of ten rows of 28 px (about 300 px high) that scrolls in its own panel under the
  table; the labels use the abbreviations of the card faces with the full name in an accessible label. No horizontal scroll.
- A "Choose a contract" step lists the available rows; Slalom and Gustav ask for the starting order; a joker asks for its
  row and inner contract.
- Texts in `de`, `fr`, `it`, `en` and `nl` through `t()`: the contract names (Swiss terms: Obenabe, Undenufe, Slalom,
  Gustav, Joker, in French: *Descente / Remontée / Slalom / Gustav / Joker*), "Slate", "Us", "Them", "Choose a contract",
  "Pass", the end-of-session sentence.
- Layout checks for the slate at 375×667 and with the German texts (`e2e/key-screens.spec.ts`; `e2e/extremes.spec.ts` for
  a four-digit total).

## Out of scope

The number of rounds, house contracts (Pagat's TUO and Barbu-like extras), the three-player and all-against-all games.

## Tests

- **Game**: every factor and the floor rule; the Pagat examples (129 → 48, match → 100); match against; Slalom's alternating
  order for both starting orders; Gustav's 6+6 for both orders; a joker's consumption of a joker row; a used contract
  cannot be chosen again; the barrel; a team with a full column passes; the session ends after 20 deals.
- **Table**: an action to choose a contract; undo of a deal restores the slate; rematch resets it; a snapshot round trip.
- **Bots**: over a seeded session a bot team only picks open rows and fills all ten; a fixture of a recorded deal for
  Slalom and Gustav.
- **Frontend**: the slate's model (cells, totals), its rendering in each locale, the contract picker; layout checks.
