# A step-by-step setup (US-105) — design

## Goal

The bot game setup is split into three short steps with plain explanations, so
the player is not faced with one long form (`docs/product-backlog.md`, US-105).
Frontend only, in `crates/beelot-server/static/`. The pass-and-play setup, which
also asks for four names, is not changed by this story.

## Decisions

- **Three steps, one group of questions each:** 1 "Game" (variant, and the
  Tout-atout option when Contrée is chosen), 2 "Rules" (announcements, match
  target), 3 "Opponents" (bot difficulty). Rejected: a step per fieldset (five
  screens for four taps each).
- **One primary button.** It reads "Next" on steps 1 and 2 and "Deal the cards"
  on step 3, and is the form's submit button, so the Enter key advances a step and
  never deals early. The submit handler advances while `step < 3`, and only on the
  last step saves the choices and starts the game (US-102 unchanged).
- **"Back"** is a text button (like "Dismiss", US-104), visibly lighter than the
  primary, shown from step 2; on step 1 the existing "Back to game modes" link
  leaves the setup.
- **Progress** reads "Step 1 of 3" (FR "Étape 1 sur 3") in a `role="status"` line
  so a step change is announced.
- **On phones** (≤ 760px) the actions sit in a sticky bar at the bottom of the
  screen.
- **Jargon explained** with native `<details>` ("What is this?") under the variant
  (Contrée, coinche) and the announcements. No script needed, keyboard operable.
- **Header and title:** the setup is inside the shared shell (logo, Settings), and
  the title gets the shell's side padding; checked at 375px.
- The steps hide with CSS on `form[data-step]`, not the `hidden` attribute, which
  the Tout-atout fieldset already uses.
- Pure helper `moveSetupStep(step, delta, total)` clamps to `1..total`.

## Tests

`frontend-tests/setup-steps.test.cjs`: the helper, the markup (three steps cover
every field, the submit button, `details` explanations, the progress status) and
the FR/NL texts. The flow is checked in a browser at 375×667.
