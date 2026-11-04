# Skip the setup by default (US-102) — design

## Goal

"Partie rapide" really is quick: it starts at once with sensible choices, and the
last customised choices are remembered (`docs/product-backlog.md`, US-102).
Frontend only. Builds on `2026-11-04-play-now-design.md`.

## Decisions

- **One shared source of truth:** `savedBotGame()` returns the remembered
  choices or `DEFAULT_BOT_GAME` (classic, announcements on, all-trumps on, 1,000
  points, relaxed bots). "Play now" and the "Quick game" card both use it; the
  future "Rejouer" (US-114) will too.
- **Remembered on the device only,** in `localStorage` key `beelot.bot-game`,
  saved when the setup form is submitted. Reads are validated field by field;
  corrupt, partial or blocked storage falls back to the defaults.
- **The setup form is pre-filled** with the remembered choices at load, so
  "Customise" starts from what the player last chose.
- **"Customise" is a text link** (`/play/bot`) under "Play now". The "Quick game"
  card becomes a `<button>` (it acts) styled like the other cards. The setup form
  itself is restructured in US-105, not here.
- Rejected: a server-side preference (needs an account; the story says device).

## Behaviour

- Quick game card / Play now: start a game with `savedBotGame()`, no form.
- Customise link: opens the setup form, pre-filled.
- Submitting the form saves its choices, then starts the game.
- Texts: "Customise" → "Personnaliser" (FR), "Aanpassen" (NL). The README
  documents the defaults.

## Tests

Node tests pin the markup (card is a button, link to `/play/bot`), that the
form's choices are saved and shown again, and the translations; the round trip is
checked in a browser.
