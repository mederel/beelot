# A cartoon home page and menus (US-100) — design

## Goal

The home page and every menu share the cartoon look of the table, so the whole
game feels like one playful world. From the backlog (`docs/product-backlog.md`,
US-100): a restyle only, with no screen, option or behaviour changes. It builds
on the home-screen animation of US-092 and supersedes it where they overlap (the
hero and the mode cards). Every effect honours the effects level of US-094
(`2026-10-31-effects-level-design.md`) and the table themes of US-087.

All the work is in `crates/beelot-server/static/` (`styles.css`, a little of
`index.html`). No server change, no new dependency, no new Settings option.

## Decisions

All decided with the user, from mockups.

- **The felt page, with tilted cards.** The page background becomes the table's
  dotted felt, with paper-white panels and pill stickers for the navigation;
  mode cards and chosen options tilt a degree or two. Rejected: keeping the dark
  purple sky and making only the controls stickers (less like the table), and a
  tabletop with a purple rim and playing-card panels (the most literal, and the
  most work).
- **A chosen option is gold, tilted, lifted and carries a ✓ disc.** The marker
  and the tilt mean the choice never relies on colour alone. Rejected: an aqua
  card with a "chosen" sticker (adds a word to every choice) and a pressed-in
  card (calmer, but the lift reads more clearly).
- **One pull request.** Everything ships together. Rejected: three pull
  requests (foundation, home, other screens), which would have been easier to
  review.

## Look

- **Page.** The body uses `--felt` and `--felt-dot` (the halftone of the table),
  so the four themes recolour the whole site. The purple sky, its radial glows
  and the hard-coded colours of the old look are replaced by the table's tokens
  (`--felt`, `--card-ink`, `--card-paper`, `--outline-width`, `--shadow-hard`,
  `--rim`, `--gold`, `--pink`, `--aqua`, `--violet`).
- **Text on felt** gets the table's ink outline (a four-way text shadow). Long
  copy sits in paper panels, so contrast never depends on the felt colour.
- **Panels** are paper with a 3 px ink outline, the hard offset shadow and a
  small radius, like the table's cards.
- **Tilt.** Mode cards and chosen options rotate a degree or two; the others
  stay level (a half degree at most).

## One component set

Defined once, used on the home page, the menus, the table, bidding, the round
result, the match-end screen and the round review.

- **Buttons.** Primary (gold), secondary (paper), danger (red), disabled and
  pressed (the shadow gives way, the button moves into it). Pill-shaped, ink
  outline, hard shadow.
- **Choice buttons** (the groups of radio inputs styled as buttons): a paper
  card with a round marker. The chosen one turns gold, tilts, lifts and its
  marker becomes a black ✓ disc.
- **Switches and checkboxes:** paper with an ink outline, gold when on, with the
  thumb position as the second signal.
- **Text fields and selects:** paper with an inset shadow and an ink outline.
- **Header.** The brand and the navigation links are pill stickers; the current
  page is a gold sticker with an underline.
- **Focus** is a thick outline ring on every control, visible on every theme.

## Screens

- **Home.** The hero keeps the US-092 card deal. The mode cards keep their
  bounce and press and are re-skinned as tilted sticker cards, one distinct
  colour each with its label unchanged; the badges, the account bar and the
  footer links become stickers.
- **Menus:** bot setup, private tables, public tables, pass-and-play, tutorial,
  rules, statistics, privacy and settings. Paper panels, outlined headings and
  the component set. No layout or copy change.
- **Game screens** (bot game, bidding, private table). The table and the bidding
  are unchanged apart from the shared buttons and the new page behind them; the
  table keeps its rim and shadow so it stays distinct on felt, which is checked
  on the sunset theme (orange felt).

## Effects levels (US-094)

No new loops. The hover and press movement of buttons and cards follows the
existing rules: Full moves, Reduced changes within `--effect-fast` without the
spring, Off shows the state change only. The tilt and the lift are resting
states, so they stay at every level.

## Accessibility (US-074)

- Every text and background pair meets WCAG AA contrast in all four themes,
  checked with a script over the stylesheet's tokens and the pairs the screens
  use (ink on paper, outlined white on felt, ink on gold, pink, aqua and violet).
- The focus ring is visible on every theme; everything stays reachable and
  operable with the keyboard; headings, labels and landmarks are unchanged.
- The ✓ disc and the current-page underline are signals besides colour.

## Texts

No new texts are expected. If one appears it goes through `t()` with French and
Dutch entries.

## Testing

- **Contrast script** over the four themes (a Node test that reads the tokens
  from `styles.css` and fails below 4.5:1 for the listed pairs).
- **Browser check** on a phone and a desktop, in all four themes and at Full,
  Reduced and Off: the home page, each menu, a bot game and its bidding, the
  round result, the match-end screen and the round review; no horizontal
  scroll; the focus ring; the tilt and the ✓ disc on chosen options.
- The usual checks: `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test --workspace` and `node --test
  crates/beelot-server/frontend-tests/`.

## Out of scope

- The table's own look, new screens or options, copy changes and sounds.
- Changes to the home-screen animation beyond keeping it on the new page.
