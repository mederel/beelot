# Design: a coached game with every hand face up (US-199)

## Goal

The tutorial of US-012 asks four questions about two cards. It never shows a game, so a new player learns what the rules say
but not how to choose a card. After this story `/tutorial` is a real game against three bots with the four hands face up, and
on each of the player's turns a coach names the card to play and says why that card, and not each of the others.

## Decisions

- **Hybrid source.** Scripted lessons first, then a free game. A lesson is a fixed deal with a preset contract and hand-written
  explanations (exact, in a good teaching order). The free game is a random deal with the auction played; its explanations are
  computed from the situation. Rejected: scripted only (no replay) and generated only (generic explanations, and the quality
  of the lessons would depend on the bot's search).
- **A server-side table kind.** The rules and the bot's search live in Rust, so the coach runs in `beelot-table`/`beelot-game`
  and the client renders what the snapshot carries. Rejected: a client-only script (it would repeat the rules in TypeScript and
  could not explain a random deal).
- **A wrong card is refused with its explanation.** On the player's turn only the coached card is accepted. Any other legal
  card gets a refusal that carries its "why not" text; the table does not change and the player chooses again. Illegal cards
  keep the normal refusal. Rejected: allowing any card (a scripted deal would diverge), allowing then undoing (the lesson loses
  its point).
- **The quiz stays as lesson 0.** The four questions of today's page are kept, unchanged, as an introduction before the table.

## The lessons (`beelot-table`, no I/O)

- `TutorialLesson { id, deal, trump, declarer, steps }`. `deal` is the four hands and the dealer; `steps` lists, in play order,
  the player's decisions: the card to play and its explanation.
- An explanation is data, not text: a code and its parameters (cards, seats, suits), as the hint reasons are, so the client
  translates it. The lesson holds, for each step, `why` (why the coached card) and `why_not` for each other legal card of that
  turn.
- The other three seats play the lesson's script too (their cards are fixed by the deal and by a bot of the Challenging
  strategy, which a test checks keeps the script on track). A lesson ends when its steps do; the cards left are played by
  the bots.
- About six lessons, one idea each: lead a trump; win a trick cheaply; follow suit; cut with a trump; leave the trick to the
  partner; give points to the partner's trick. The list and the deals are written in the plan.
- A test plays every lesson with its coached cards and checks that each coached card is legal, that each `why_not` card is
  legal and not the coached one, and that every legal card of a step has an explanation.

## The free game (`beelot-game`)

- `explain_card(view) -> CardExplanation { best, why, others: Vec<(Card, WhyNot)> }`, next to `card_hint`. `best` is
  the Challenging bot's card, `why` the existing `CardReason`. Each other legal card gets the first `WhyNot` that holds:
  `WastesHighTrump`, `OvertakesPartner`, `LosesTheTrick` (when another card wins), `GivesPointsAway`, `SpendsAMaster`,
  `NotCheapest`, and `WeakerForTheRound` when none does.
  It is derived from the view like `card_reason`, so the search runs once.
- Calls: the free game's auction uses `auction_hint` and its `AuctionReason` as the hints do. The coach accepts only the hinted
  call; the other calls are refused with a short explanation (`WhyNotCall`: too weak, would overbid the partner, ...). Only
  the codes the hints already have are used for the right call; the refused calls get the few new codes of `WhyNotCall`.
- The coached card is computed by the same code the hint uses, so the coach and the hint never disagree.

## The table

- `TableKind::Tutorial`. Made by `POST` on the same route as a solo table, with the lesson to start. It is not saved, not
  counted (`counts.rs`), not listed, not rated, not handed to the history, and has no spectators. It is dropped when the
  player leaves or after the usual idle time.
- Snapshot: `hands` for all four seats (the other kinds never send them), and `coach`:
  `{ lesson, step, steps, instruction, why, whyNot? }` for the player's turn. `whyNot` appears on the refusal's response and in
  the snapshot until the player plays. `hints` stays off: the coach replaces them.
- Refusal: `Conflict { code: "tutorial-card", message }` where the message carries the "why not" code and its parameters. It
  reaches the client through the existing conflict path.
- A lesson starts in the play, with its contract preset: there is no auction in a lesson. The table needs a way to start a
  round from given hands, a trump and a declarer. The tests already build boards that way (`GameBoard`), so it is a matter of
  exposing it to the table, not of new rules. The plan's first task checks this and, if the table cannot start from a given
  board, the story stops to say so.
- The free game is an ordinary solo table (random deal, auction, play, scoring) with `kind: Tutorial`, the coach on and
  one match to a low target.

## The frontend

- `/tutorial` becomes a table page. The quiz is its first screen; "Start the game" opens the first lesson.
- A coach panel on the table: the situation in a line, the instruction ("Play the 9 of hearts"), the reason, and, after a wrong
  tap, the "why not" of the tapped card. On a phone (375×667) it sits above the hand and folds to one line, so it never
  hides the hand or the trick.
- The coached card is lit in the hand; the other legal cards stay tappable, so that a tap shows its "why not".
- The three other hands are drawn face up, small, at their seats.
- Progress (lessons done) is kept in the browser's storage module (US-194). The last lesson sets `tutorial-seen` as today.
- Every text goes through `t()` with its French and Dutch (`fr.ts`, `nl.ts`). Reasons arrive as codes and parameters, so
  the server sends no English prose the client would not translate.
- No inline style or script (CSP); `static/` is rebuilt and committed.

## Out of scope

- Coaching of bids in the lessons (they start in the play) and of announcements (belote, tierce, ...).
- Tutorials for the Coinche variants and all-trumps; the first version teaches Classic.
- Voice, animation of the coach, achievements for finishing the tutorial.

## Tests

- Rust: every lesson plays through with its coached cards; `explain_card` per situation (one test per `WhyNot`, and one that
  the best card never appears among the others); a wrong card is refused with its code and leaves the table unchanged; the
  tutorial kind is not saved, counted or listed; the snapshot shows four hands only for this kind.
- Frontend (Vitest): the coach panel mounted for each state (instruction, wrong card, finished lesson), the snapshot contract,
  every text in French and Dutch, the route and the CSP checks that exist.
- A browser check at 375×667 and 1280×800: one scripted lesson and a few turns of the free game in English and in French.

## Risks

- **The explanations must be true.** A `WhyNot` is derived from the cards, never written by hand for the free game, and the
  lessons' hand-written ones are checked against the rules by the test above.
- **The Challenging bot may choose a card that is hard to explain.** `BestForRound` is the fallback; the plan counts, over a
  few hundred seeded deals, how often it is the reason, and the story is not done while it is the reason of more than a
  tenth of the turns.
- **Starting a round from given hands** is the one unknown in the table (see above).
