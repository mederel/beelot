# End the match with a show (US-093) — design

## Goal

When a match ends, a cartoon end-of-match screen shows the result. From the
backlog (`docs/product-backlog.md`):

- The winning team is shown on a cartoon podium, with the final scores.
- A recap shows the number of rounds, the biggest round and the announcements
  of the match.
- "Play again" and "Home" buttons are offered.

Every effect honours the effects level of US-094
(`2026-10-31-effects-level-design.md`), and new texts are translated into
French and Dutch. The recap needs data the match snapshot does not carry today,
so this story has a small server part (`beelot-game` and `beelot-server`) and a
frontend part (`crates/beelot-server/static/`). No new dependency, no new
Settings option, no database or history change.

## Decisions

All decided with the user.

- **A takeover screen (layout A).** One full-screen page replaces the table:
  sticker, podium, recap, buttons. Rejected: a compact panel under the table
  (the smallest change, but less of an event) and a podium drawn on the table's
  felt (most playful, but the recap and buttons would still sit below).
- **The server provides the recap (approach 1).** The server already keeps every
  round of the live match; it adds a `recap` to the match snapshot. It survives
  a reload and is identical for every client of a private table, including one
  that joins or reloads late. Rejected: counting rounds in the client (wrong
  after a reload or a late join) and sending every round for the client to
  total (a larger payload on every poll, and rules in two places).
- **The recap is exactly the backlog's three facts.** Rounds played, the biggest
  round, and the scored announcements of each team. Rejected: a row of "fun
  facts" (capots, coinches, belotes) and a per-round table.
- **It opens by itself, and the player can look at the table (option B).** It
  appears after the match sticker has finished. "View table" hides it, so the
  last trick and the score bar can be looked at, and a "Results" button brings
  it back. Rejected: no way back, and opening only when asked.
- **Only the winning viewer is celebrated**, as in US-090. A viewer on the
  losing team sees the same podium with a neutral heading and no confetti or
  sticker.
- **The buttons keep their meaning.** "Play again" is today's rematch action
  (`{ type: "rematch" }`) in all three modes; "Home" goes to `/`.
- **The final scores appear at once**, with no count-up: the podium animation
  is already busy.

## Server

`MatchView` (`crates/beelot-server/src/api/snapshot.rs`) gains `recap`, present
only when the match is complete (`Option`, left out of the JSON otherwise), so
snapshots of a match in progress and their contract files do not change:

```json
"recap": {
  "rounds": 7,
  "biggestRound": { "round": 4, "team": "East–West", "points": 182 },
  "announcements": {
    "northSouth": { "tierce": 1, "cinquante": 0, "cent": 0, "carre": 1 },
    "eastWest":   { "tierce": 0, "cinquante": 0, "cent": 0, "carre": 0 }
  }
}
```

- `rounds` is the number of rounds played.
- `biggestRound` is the largest points total awarded to one team in one round;
  `round` counts from 1. A tie goes to the earliest round, and within a round to
  North–South. It is null for a match with no round (never in practice).
- `announcements` counts the announcements that scored (`Declaration.scored`),
  not those only declared, by kind and by the team of the declaring seat.
- The recap is built in `beelot-game` as `MatchScore::recap()` (a
  `MatchRecap` value, serialisable in camelCase) from the `RoundSummary` list
  the match already keeps, and the snapshot only attaches it. It is unit-tested
  in `beelot-game`; an integration test in `table_flow.rs` plays a match to its
  end and checks the snapshot's `match.recap` against the match's own rounds
  (and that there is none while the match is in progress). The existing contract
  files are unchanged, because they all show matches in progress.

## Client

Two units in a new `static/match-end.js`, loaded after `celebrations.js`:

- **The pure part**, exported for Node as `score-bar.js` and `celebrations.js`
  are: `matchEndModel({ match, seats, myTeam })` returns `{ winner, iWon,
  podium, recap }`, or null when the match is not complete or has no `recap`.
  `podium` is two steps, the winner first: `{ place, team, names, score }`, with
  the names taken from the board's seats of that team. `recap` is structured
  data (rounds, biggest round, per-team announcement counts), not text.
- **The DOM part**: `showMatchEnd(model, { confetti })` and `hideMatchEnd()`
  drive one shared overlay `#match-end` in `index.html`, used by bot games,
  pass-and-play and private tables. It is a `role="dialog"` named by its
  heading (the winner), with focus on "Play again". "View table" and Escape
  hide it.

The confetti pieces are built by `celebrations.js`; their construction is
pulled out of `celebrate` into a helper both use.

### Behaviour

- **Timing.** When the match completes, the overlay opens after the match
  sticker of US-090 has finished, about 2.4 s after the trick reveal; a viewer on
  the losing team has no sticker, so it opens about 1 s after the reveal. In
  pass-and-play it waits for the hand-off cover first, like the celebrations.
- **View table and Results.** "View table" hides the overlay and records that it
  was dismissed for this game (in memory only). The round-result panel shows a
  "Results" button once the match is complete; it shows the overlay again.
- **Reload.** A reload on a finished match shows the overlay at once, with no
  delay and no confetti. The dismissed state does not survive a reload.
- **Rematch.** A new match (the rematch action) hides the overlay and clears the
  dismissed state; the round-result panel's own rematch button is replaced by
  "Results" once the overlay owns "Play again".

### Effects levels (US-094)

| Level | Overlay | Podium | Confetti |
| --- | --- | --- | --- |
| Full | fades in | the steps rise one after the other, the sticker pops | falls, winning viewer only |
| Reduced | fades in within `--effect-fast` | still | none |
| Off | appears at once | still | none |

The `matchWin` sound already plays with the US-090 sticker, so the overlay adds
no sound. The sticker and the podium carry information, so they are kept at
every level.

### Texts

New strings go through `t()` with French and Dutch entries: "Final score", "View
table", "Results", "Home", "{0} rounds", "Biggest round: {0} points, {1}, round
{2}", "Announcements" and "None". Announcement counts read "Tierce ×1, Carré
×1", so no plurals are needed; the kind names reuse the existing translations.
The French and Dutch wording needs a native speaker's review before auto-merge.

### Accessibility

The overlay is a modal dialog: focus moves to "Play again" when it opens and
returns to the "Results" button when it closes, and the table behind it is
`inert` while it is open. The podium and the recap are text, so a screen reader
reads them in order; the confetti is `aria-hidden`.

## Testing

- **Rust:** unit tests for `MatchScore::recap()` (rounds, biggest round and its
  tie rules, scored versus declared announcements, attribution to the declaring
  seat's team) and for the snapshot (`recap` absent while the match is in
  progress, present when complete, and equal to the recap of the rounds kept).
- **Node unit tests** for `matchEndModel`: both winners, the viewer on each team
  and in no team, the podium order and names, a missing `recap`, an incomplete
  match.
- **Browser check** at Full, Reduced and Off, on a phone, tablet and desktop;
  on a bot game, pass-and-play and, if an account is available, a private table;
  winning and losing viewer; "View table", "Results", Escape and focus; a reload
  on a finished match; "Play again" starting a new match and "Home".
- The usual checks: `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test --workspace` and `node --test
  crates/beelot-server/frontend-tests/`.

## Out of scope

- A per-round table, "fun facts" (capots, coinches, belotes) and share cards.
- Any change to the match history or its export.
- The home screen (US-092).
