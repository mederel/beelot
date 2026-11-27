# Design: play Klaverjas with the Rotterdam rules (US-214)

Issue: <https://github.com/mederel/beelot/issues/507>. Depends on US-213 (issue #506, Klaverjas Amsterdams), whose `Variant`,
deal, trump selection, roem and scoring this story reuses. Source: [Pagat — Klaverjassen](https://www.pagat.com/jass/klaverjassen.html).

## Problem

Klaverjas players from Rotterdam and the south of the Netherlands play with a stricter trumping rule than Amsterdam. US-213 only
offers the Amsterdam one, so these players cannot play by the rules they grew up with.

## Decision

Rotterdams is a **rule option** of the Klaverjas variant, not a second variant and not a copy of the Amsterdam code. The option
is an enum (`KlaverjasRules::{Amsterdams, Rotterdams}`, default `Amsterdams`) in the Klaverjas settings that US-213 introduces,
chosen in the setup sheet and stored with the table like the other options. Everything that does not depend on the legal-play
rule (deck, card order and points, trump choice, roem, last trick, pit, nat) is shared and unchanged.

### The rule set

Called "the rule set" below: Pagat's description of the Rotterdam rules, with the questions it leaves open settled as follows.

When the player must follow suit (they hold a card of the led suit) nothing differs: they follow, and when the led suit is
trump they overtrump if they can. The difference is when the player **cannot follow suit**:

| Situation (void in the led suit, holding at least one trump) | Amsterdams | Rotterdams |
| --- | --- | --- |
| Partner is winning the trick | any card | must trump, as below |
| An opponent is winning the trick | must trump, overtrumping if able | must trump, overtrumping if able |
| No trump holder yet, an opponent winning | must trump | must trump |

Rotterdams in full, for a player void in the led suit:

1. If they hold a trump that beats every trump already in the trick (or the trick has none), they **must play such a trump**,
   even when their partner is currently winning.
2. Otherwise, if they hold a non-trump card, they must play a non-trump card: **undertrumping is forbidden when it can be
   avoided**.
3. Otherwise (only trumps, all lower than one in the trick) they play any trump.
4. A player with no trump plays any card.

Amsterdams keeps its US-213 rule unchanged, including its handling of undertrumping. The engine rejects an illegal play with the
error it already uses.

### Scoring

The Rotterdam scoring is the Amsterdam one: card points, roem (20 / 50 / 100 / 100 for four of a kind, jacks 200), 10 for the
last trick, pit 100, and nat when the declaring side does not score more than the opponents. No difference is implemented, and
`pages/docs/` says so in the rules page.

### Layers

- `beelot-game`: `KlaverjasRules` in the Klaverjas settings; the legal-plays function takes it. One function holds the shared
  logic and branches on the option only for the partner-winning and undertrumping cases.
- `beelot-table` and `beelot-server`: the option travels with the other table settings (lobby, persistence, snapshot) and is
  validated like them; an old stored table without it reads as Amsterdams. A solo or pass-and-play table takes it in its
  create request (`klaverjasRules`); the owner of a private table chooses it in the lobby before the start, with the
  `settings` action, like tout-atout; a public table always plays Amsterdams. The snapshot's table sends it at a Klaverjas
  table only.
- Bots: they choose among the legal plays the engine gives them, so they respect the option; a test plays full bot deals under
  Rotterdams with the legality check on.
- Frontend: a choice "Amsterdams / Rotterdams" in the Klaverjas part of the setup sheet, shown in the lobby's summary of the
  table; texts through `t()` in English, French and Dutch.
- Docs: the Klaverjas rules page in `pages/docs/` lists the Rotterdam rules and says the scoring is the same.

## Tests

- The same deal gives different legal plays under Amsterdams and Rotterdams (partner winning with a non-trump lead, void
  player holding a trump).
- Rotterdams: forced trump over a winning partner; forced overtrump; undertrump rejected when a non-trump card exists; undertrump
  allowed when only low trumps remain; no trump means free discard.
- Amsterdams legal plays are unchanged (the US-213 tests still pass).
- Table and server: the option round-trips through settings and persistence; a table without it is Amsterdams.
- Frontend: the setup sheet's choice is sent and shown; the setup screen stays in the layout checks.

## Out of scope

The other regional rule sets of Klaverjas.
