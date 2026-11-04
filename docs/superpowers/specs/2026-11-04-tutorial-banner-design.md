# A clear path for people new to belote (US-104) — design

## Goal

A first-time visitor is pointed to the tutorial before any real game
(`docs/product-backlog.md`, US-104). Frontend only, in
`crates/beelot-server/static/`.

## Decisions

- **A banner above the mode cards**: "New to Belote? Learn it in 3 minutes", a
  "Start the tutorial" button (link to `/tutorial`) and a text "Dismiss" button.
  It is an `<aside>` named by its heading text (`aria-labelledby`); both controls
  are native, so keyboard operation and focus rings come with them.
- **Shown to guests who have not seen it**: `shouldShowTutorialBanner({ seen,
  signedIn })` is `!seen && !signedIn`. Whether the visitor is signed in is only
  known once `/api/account` answers, so the banner stays hidden until then; if the
  call fails the visitor is treated as a guest.
- **"Seen" is remembered on the device** in `localStorage` key
  `beelot.tutorial-seen`, set when the banner is dismissed or the tutorial's last
  lesson is finished. Storage that throws counts as "not seen" (the banner may
  return) and is never fatal. Rejected: a server flag (needs an account; the
  story says device).
- **"Learn the moves" becomes "Learn the basics"** ("Apprenez les bases", "Leer
  de basis") and is the second mode card, right after Quick game.
- No new effect or animation; the banner reuses the sticker styles of US-100.

## Tests

`frontend-tests/tutorial-banner.test.cjs` covers `shouldShowTutorialBanner`, the
storage helpers (including throwing storage), the markup (banner above the grid,
labelled, tutorial card second) and the FR/NL texts. The flow is checked in a
browser.
