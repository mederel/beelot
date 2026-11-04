# A readable table header (US-106) — design

## Goal

At a solo or pass-and-play table the player always sees, in one stable place, a
menu button, the compact score (US-096) and one status line saying whose turn it
is (`docs/product-backlog.md`, US-106). Frontend only, in
`crates/beelot-server/static/`.

## Scope

- **In:** the bidding view and the card-table view of solo and pass-and-play
  games. They share one header, so it does not change when the auction ends.
- **Out:** the online private table keeps its chips and message line (it has
  other controls: invitations, reactions, owner actions). It still gets the
  wrapper, with the menu bar and status line hidden. Pass-and-play's setup and the
  tutorial are unchanged.

## Decisions

- **`#table-header` wraps the score bar and a new `#table-bar`.** The wrapper is
  the sticky element (same top and `z-index: 40` as the score bar today, under the
  pass-and-play cover); the score bar stays a `role="group"` of its own and the
  menu is not inside it.
- **The bar is a menu button and the status line.** "Menu" (☰) is a disclosure
  button (`aria-expanded`, `aria-controls="table-menu"`, the pattern of the
  sign-in toggle); Escape closes it and returns focus to the button, as does a
  click outside.
- **The menu gathers "Hint", "Rules reference" and "Leave table"**, replacing the
  hint buttons, the `.game-footer` links and the contract/turn chips. "Leave table"
  is set apart under a divider and styled as a danger item, so US-110 (confirm,
  danger style) lands without moving it next to a frequent action. One shared
  `#table-hint-button` serves bidding and play (`offerHint`).
- **One status line, `#table-status`** (`role="status"`), the single place for
  turn text. It replaces the "Contract / Turn" chips, the opening-card prompt,
  "Dealing the remaining cards…" in the trick area, `#bidding-message` and the
  trick area's error text. The contract is still shown by the contract badge at
  the declaring seat (US-095). Hints' reason lines are unchanged (US-107).
- **Pure model `table-status.js`:** `tableStatus(state)` returns `{ text, args }`
  (English key and player names), for: bidding (auction over, my turn, a bot's
  turn), play (round over, dealing, trick being collected, my turn, a bot's
  turn), and pass-and-play, which names the player instead of "You".
- **Announced once:** `setTableStatus(text)` writes only when the text changes (as
  the score bar's live sentence does), and errors go through it too so a later
  render replaces them. Cleared on every `renderView`.
- **Texts** (EN → FR → NL): "Your turn to play" → "À vous de jouer" → "Jouw
  beurt"; "Your turn to bid" → "À vous d'annoncer" → "Jij moet bieden"; "{0}, your
  turn to play" → "{0}, à vous de jouer" → "{0}, jouw beurt"; "{0}, your turn to
  bid" → "{0}, à vous d'annoncer" → "{0}, jij moet bieden"; "{0} is thinking…" →
  "{0} réfléchit…" → "{0} denkt na…"; "{0} takes the trick" → "{0} remporte le pli"
  → "{0} wint de slag"; "Round over" → "Manche terminée" → "Ronde voorbij"; "The
  auction is over" → "Les enchères sont terminées" → "De bieding is voorbij";
  "Menu" → "Menu" → "Menu".
- **Contrast:** the status line and the menu use the paper/ink tokens, and a test
  asserts the text/background contrast ≥ 4.5:1 in the four themes (US-087).
- **Space:** the phone header must not push the hand off a 375×667 screen: the
  `.game-heading`, chip row and footer it replaces give back the room.

## Tests

`frontend-tests/table-status.test.cjs`: every state of `tableStatus`, the markup
(wrapper, menu disclosure attributes, status role, the three menu entries with
Leave last, no chips/footer/bidding message left), FR/NL texts, and the contrast
of the status styles in all themes. The flow is checked in a browser at 375×667
in both views.
