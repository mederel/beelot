# Play again in one tap (US-114)

## Findings

- The end-of-match screen (US-093) already has a primary "Play again" button that clicks the table's rematch
  button, and a "Home" link. A solo rematch keeps the table's variant, options and target and shuffles a new deck.
- At a private or public online table the `rematch` action restarts the match at once for everybody as soon as
  one seat clicks it. Nothing is proposed.

## Decisions

- **Actions**: "Play again" stays the primary button. Two secondary actions follow: "Change options" (solo game
  only: it goes to the setup page `/play/bot`; online options belong to the lobby, so it is not shown) and
  "Back to home". "View table" stays a text link.
- **Online rematch is a proposal.** `Rematch` records a vote for the seat. The match restarts when every
  connected human seat has voted; bots and disconnected seats never hold it up. Solo and pass-and-play restart
  at once. A second vote by the same seat changes nothing. A new deal clears the votes.
- **Snapshot**: `match.rematchVoted` and `match.rematchPending` (seat positions, omitted when empty).
- **Screen**: after a vote the primary button is disabled and says "Waiting for {names}…". Seats that have not
  voted see "{name} wants a rematch" and the button reads "Accept rematch". The screen stays open until the new
  match begins (the existing reset on a match that is not complete closes it).
- Texts in French and Dutch (native review pending).

## Out of scope

Declining a rematch, a timeout on the proposal, and changing the options of an online table from the screen.
