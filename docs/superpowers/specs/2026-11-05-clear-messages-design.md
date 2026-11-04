# Messages that do not hide the cards (US-107) — design

## Goal

Hints and prompts stay out of the way of the cards the player has to read: the
turned card and the trick (`docs/product-backlog.md`, US-107). Frontend only, in
`crates/beelot-server/static/`. It builds on the status line of US-106
(`2026-11-04-table-header-design.md`).

## What covers the cards today

- The solo table's "why this card cannot be played" bubble (`.hand-reason`) floats
  over the felt, above the hand, where on a phone it reaches the trick.
- The turned card of the auction is small (about 58×84 px on a phone).
- The accept button says "Accept upturned suit" without naming the suit, and
  "Pass" does not say what happens next.

## Decisions

- **A rejected card's reason goes to the status line** (the header's
  `#table-status`) for three seconds, then the turn text comes back. The floating
  bubble is removed from the solo table. The online private table has no status
  line yet and keeps its bubble (out of scope, as in US-106). Coach hint reasons
  already sit under the table, not on the felt, and bot comments are bubbles
  attached to their seat: both stay.
- **The status line is the one writer:** `flashTableStatus(text, ms)` shows a
  message and restores the last turn text; a render replaces a flash at once, and
  `clearHandReasons` restores the turn text. Written through the same
  change-only setter, so screen readers hear each message once (`role="status"`).
- **The turned card is larger:** the auction's `.upturned-card` sets `--cw: 76px;
  --ch: 110px` (the card sizes the page already uses), checked at 375×667 so the
  hand and the dock still fit.
- **The accept button names the suit:** "Take {0}" with the suit name and symbol
  ("Prendre ♥ Cœur", NL "Neem ♥ Harten") in round 1 of Classic; the generic text
  stays for the private table.
- **"Pass" gets a one-line explanation under the buttons** (`#bid-help`, linked
  with `aria-describedby`), so the button does not get longer. Texts: Classic
  round 1 "Pass: the next player may take the card."; Classic round 2 "Pass: if
  all four players pass, the cards are dealt again."; Contrée "Pass: you make no
  bid. If all four players pass, the cards are dealt again."
- A pure `passHelp({ variant, round })` in `table-status.js` picks the text.
- Texts are translated into French and Dutch.

## Tests

`frontend-tests/clear-messages.test.cjs`: `passHelp`, the markup (no solo
`.hand-reason`, `#bid-help` with `aria-describedby`), the larger turned card, the
FR/NL texts. The flow is checked in a browser at 375×667.
