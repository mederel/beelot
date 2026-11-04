# Play in one tap (US-101) — design

## Goal

A new visitor on a phone sees one prominent "Play now" button without scrolling
and starts a bot game with no setup screen (`docs/product-backlog.md`, US-101).
Frontend only, in `crates/beelot-server/static/`: no server change, no new
dependency, no new Settings option. The defaults are those of US-102
(`2026-11-04-quick-game-defaults-design.md`).

## Decisions

- **The button sits right under the headline**, before the intro, so it is the
  first action seen. It reuses the cartoon `.button` sticker (US-100) and is the
  hero's only primary-style element.
- **It is a `<button>`, not a link:** it acts (creates a table) instead of
  navigating. Errors show in a `role="alert"` line under it.
- **Phones (≤ 760px) get a compact hero** so the button and the top of the first
  mode card are above the fold at 375×667: headline 2.5rem, full-width button,
  eyebrow and highlight badges hidden, shorter deal animation. Rejected: moving
  the mode cards above the intro (changes the page order for every viewport).
- **No new effect:** it keeps the existing button hover/press, which already
  follows the effects level (US-094).

## Behaviour

- Click starts a bot game (`kind: "LOCAL"`, classic, announcements on,
  all-trumps on, 1,000 points, relaxed bots), then opens its bidding screen.
- The button is disabled while the request runs.
- New text "Play now" is translated: "Jouer maintenant", "Nu spelen".

## Tests

Node tests (`frontend-tests/play-now.test.cjs`) pin the markup order, the defaults
against the setup form's pre-selected options, and the translations. The fold is
checked in a browser at 375×667.
