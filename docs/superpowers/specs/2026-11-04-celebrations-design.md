# Celebrate great moments (US-090) — design

## Goal

Big plays are celebrated with a cartoon sticker, a burst of confetti or stars
and a synthesised sound. From the backlog (`docs/product-backlog.md`):

- A cartoon banner and a burst of confetti or stars mark a won round, a capot,
  belote and rebelote, and the match victory.
- A broken contract and a successful coinche have their own distinct effects.
- Each effect has a matching synthesised sound (US-027).
- Effects never hide the cards or delay the next action by more than two
  seconds.

Every effect honours the effects level of US-094
(`2026-10-31-effects-level-design.md`). Frontend only
(`crates/beelot-server/static/`): no server change, no new dependency, no new
Settings option. Everything needed is already in the data the client receives:
`roundResult.contractMade`, `capotTeam`, the belote bonuses, and the board's
`declaringTeam`, `coinched` and `declarationMessage`.

## Decisions

All decided with the user.

- **Only the viewer's team is celebrated.** Capots, coinches and so on of the
  opponents get no sticker, confetti or new sound. A lost match gets no sticker
  either, only today's `roundLose` sound. In pass-and-play, "the viewer's team"
  is the team of the seat currently shown, so each team's big plays are
  celebrated when it is that team's turn to look.
- **One sticker per round end, the rest as chips.** The highest-priority moment
  is the sticker, with its confetti and sound. The other moments that apply
  appear as small chips under it. Rejected: playing them one after another
  (longer, risks feeling like a delay) and showing only the best one (loses
  information).
- **Style: the tilted comic sticker over the trick area.** Rejected: a
  full-width ribbon (crosses the trick cards) and a small badge above the seat
  (quiet, easy to miss on a phone).
- **The viewer's own broken contract gets a gloomy sticker, not a celebration.**
  A grey-blue "Down!" that droops, no confetti, a low "wah-wah" sound. Rejected:
  nothing (leaves the backlog's distinct broken-contract effect for the
  defenders only).
- **"Round won!" is kept on every round the viewer's team wins**, at the same
  size as the others.
- **Sounds play regardless of the effects level.** Sound is its own Settings
  option (US-027). At effects Off the sticker still appears but is still, with
  no confetti or motion.
- **Pacing is not changed.** The sticker never delays an action (see Timing).

## Moments

The viewer's team is "mine". Highest priority first:

| Moment | Condition | Sticker | Effect | Sound |
| --- | --- | --- | --- | --- |
| `matchWin` | the match ends and my team wins | "Victory!" | largest confetti | `matchWin` (existing) |
| `capot` | `round.capotTeam` is my team | "Capot!" | confetti | `capot` (new) |
| `coincheWon` | the contract was coinched and it ended in my favour: my team coinched it and it failed, or my team declared it and made it | "Coinche!" | stars | `coincheWon` (new) |
| `defended` | the opponents declared, not coinched, and failed | "Down!" | confetti | `defended` (new) |
| `roundWon` | my awarded score is at least theirs (the rule of `roundSound`) | "Round won!" | light confetti | `roundWin` (existing) |
| `contractLost` | my team declared and failed | grey-blue "Down!", droops | no confetti | `contractLost` (new) |

`contractLost` is never combined with the others: if my team failed its
contract it is the only moment shown (a belote chip may still appear, see
below). The ranked list is the order of the table, `matchWin` first.

### Chips

Every other moment of the list that applies is a chip under the sticker, in
priority order, plus two facts: "Belote ✓" when my team's belote bonus scored in
the round, and "+250" (or the bid-plus-250 total) when it was a capot. A chip is
text only and does not repeat the sound or the confetti.

### Belote and rebelote

They are celebrated when played, not at round end. The first card of the
pair gives a small "Belote!" sticker and the second "Rebelote!", for my team
only, with the `belote` sound and no confetti. The trigger is a
`declarationMessage` that differs from the previous one seen for that game; the
first one seen for a game is ignored, so a reload mid-round does not celebrate.
The message is free text naming the player, so the declaring team is the `team`
of the seat whose `name` followed by `" declares"` starts the message (the
longest matching name wins, so `Al` and `Alex` do not clash):
`momentForBelote({ message, previousMessage, seats, myTeam })`. The same belote
shows again as a chip on the round-end sticker.

## Structure

Two units in a new `static/celebrations.js`, loaded in `index.html` after
`sounds.js` and `effects.js`:

- **The pure part**, exported for Node as `score-bar.js` and `effects.js` are:
  - `momentsForRound({ round, board, match, myTeam })` returns
    `{ sticker, chips }`, where `sticker` is one of the table's moments and
    `chips` is a list of chip descriptors.
  - `momentForBelote({ message, myTeam })` returns `"belote"`, `"rebelote"` or
    `null`.
  It has no DOM and no dependency, and is unit-tested.
- **The DOM part**, `celebrate(sticker, chips)`, guarded like `effects.js` so
  Node can load the file:
  - builds one `.celebration` element: the sticker, its chips and about 14
    confetti pieces (`<i>`), and puts it in the table area, centred over the
    trick;
  - plays the moment's sound with `playSound`;
  - removes itself after 1.8 s (a fixed timer, not `animationend`, so a missing
    animation still removes it);
  - replaces a celebration that is still showing.

`app.js` gets one entry point, `celebrateRound(container, round, board, match,
myTeam)`, which waits for the trick reveal exactly as `soundAfterTrick` does
(`revealMs + 500`) and then calls `momentsForRound` and `celebrate`. It replaces
the sound-only calls in the two result flows: private tables
(`app.js:903`) and local or bot games (`app.js:1100`). Pass-and-play uses the
local flow. `roundSound` stays for the `roundLose` case where there is no
sticker.

New sounds are entries in the `sounds` table of `sounds.js`, in the same style
(`tone`, `noise`, `arpeggio`): `capot` (a rising run), `coincheWon` (a heavy hit
and an arpeggio), `defended` (a short bright pair), `belote` (a two-note chime)
and `contractLost` (a low "wah-wah").

## Timing

- The sticker appears after the trick reveal, as the result sound does today.
- It lasts at most 1.8 s, under the two seconds of the backlog.
- It has `pointer-events: none` and a z-index below the hand and the action
  buttons, so cards and "Next round" stay visible and usable. The buttons are
  never delayed by it.
- Only one celebration is on screen at a time.

## Effects levels (US-094)

| Level | Sticker | Confetti and stars |
| --- | --- | --- |
| Full | pops in, wobbles, fades out | fall and twinkle |
| Reduced | fades in within `--effect-fast` and stays still | none |
| Off | appears at once and disappears, still | none |

The sticker carries information (what happened), so it is kept at every level,
in line with the effects-level rule that decoration stops while information
stays. The CSS uses the `body[data-effects]` rules and `--effect-fast` custom
property of US-094, and each new keyframe gets its Reduced and Off rule.
`contractLost` droops only at Full.

## Texts

The stickers and chips are added to the English source strings with French and
Dutch translations, through `t()`: "Victory!", "Capot!", "Coinche!", "Down!",
"Round won!", "Belote!", "Rebelote!", "Belote ✓". The French and Dutch wording
needs a native speaker's review before auto-merge, as for earlier stories.

## Accessibility

The celebration is `aria-hidden`: the round result text and the live regions
already announce what happened, so a screen reader hears it once and no
intermediate state. The sticker text is also in the round-result breakdown.

## Testing

- Node unit tests for `celebrations.js`: every row of the moments table; the
  priority order and the chips; `contractLost` alone; the viewer's team in both
  teams and in pass-and-play; no sticker for an opponent's capot, coinche or a
  lost match; belote and rebelote detection from `declarationMessage`.
- `celebrate` needs a DOM, which the Node tests do not have, so it is covered by the
  browser check below (one element, removed after the timer, replaced by the next).
- A browser check at Full, Reduced and Off, on a phone, tablet and desktop, on
  a local bot game and a private table (a capot and a coinche are staged with a
  recorded deal from `fixtures/` if a live one is not practical), and with the
  sound off.
- The usual checks: `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test --workspace` and the frontend tests.

## Out of scope

- The end-of-match podium and recap (US-093); the match victory here is a
  sticker with confetti only.
- Celebrating the opponents' plays, and any server change.
