# Confirm before leaving a table (US-110) — design

## Goal

One stray tap must not lose a game (`docs/product-backlog.md`, US-110). Leaving a
table while a match is in progress asks for confirmation and says what happens.
Frontend only, in `crates/beelot-server/static/`. The danger styling and the
placement away from frequent actions of "Leave table" were delivered by the
header menu of US-106 (red, under a divider, last in the menu).

## Decisions

- **A modal `<dialog>`** (`#leave-dialog`, `showModal()`): the browser gives the
  focus trap, Escape to cancel and focus return to the button that opened it.
  Title "Leave this table?", a message, a primary **Stay** (autofocus) and a
  danger **Leave** button. Rejected: `window.confirm` (unstyled, untranslatable
  buttons, blocked in some contexts).
- **What it says depends on the table:** solo and pass-and-play: "The game will be
  abandoned." Online (private or public) in progress: "If you stay away, a bot
  will take over your seat." (the server hands a disconnected seat to a bot after
  a delay). No dialog once the match is complete, or when the table has not
  started (the online lobby's leave button frees the seat and loses nothing).
- **Which links ask:** the header menu's "Leave table" (`data-confirm-leave="solo"`)
  and the online table's "Leave table" link (`data-confirm-leave="online"`). The
  existing link handler checks the attribute, so modified clicks (new tab) are
  untouched.
- **Pure `leaveConfirmation({ kind, matchComplete })`** in `leave-confirm.js`
  returns `null` or `{ title, message }` (English keys), Node-tested. The page
  records the current table in `leaveState`, set by the solo and online loaders
  and cleared on each `renderView`.
- **Texts** (EN → FR → NL): "Leave this table?" → "Quitter la table ?" → "Tafel
  verlaten?"; "The game will be abandoned." → "La partie sera abandonnée." →
  "Het spel wordt opgegeven."; "If you stay away, a bot will take over your seat."
  → "Si vous restez absent, un bot prendra votre place." → "Als je wegblijft, neemt
  een bot je plaats in."; "Stay" → "Rester" → "Blijven"; "Leave" → "Quitter" →
  "Verlaten".

## Tests

`frontend-tests/confirm-leave.test.cjs`: `leaveConfirmation` for each case, the
markup (dialog, labelled, Stay first and autofocus, danger Leave, the two links
carry `data-confirm-leave`), the FR/NL texts. The flow is checked in a browser:
Stay keeps the game, Escape cancels, Leave goes to the setup, a finished match
leaves without asking.
