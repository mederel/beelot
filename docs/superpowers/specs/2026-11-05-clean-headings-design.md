# Clean headings on the felt (US-111) — design

## Goal

Titles and subtitles on the felt look clean: no ghosted or doubled text, nothing
clipped at 375 px, in every table theme and at the largest browser text size
(`docs/product-backlog.md`, US-111). CSS only, in
`crates/beelot-server/static/styles.css`.

## What is wrong (seen at 3× zoom, 375 px)

- Every `h1` casts a hard 4 px drop shadow on top of the ink outline, with a line
  height of 0.92: on a heading that wraps ("Faites votre / annonce.") the shadow of
  the first line shows under the second, a ghost copy of the text. On the small
  headings of the table (1.05 rem) the 4 px shadow is bigger than the letters'
  detail.
- The shared `--text-outline` also carries a 2 px drop shadow. On 11–13 px
  subtitles, eyebrows and legends it reads as doubled text.

## Decisions

- **Headings:** `h1` gets a line height of 1.05 and the outline only; the big 4 px
  shadow stays on the home hero (`.home-view h1`), which is large and has room.
- **Small text on the felt** (eyebrows, the variant/difficulty subtitle, the setup
  step line and legends) uses a new `--text-outline-thin`: the four-corner outline
  without the drop.
- **No clipping:** the headings wrap (no fixed height, no `overflow: hidden`) and
  the table header's heading rows are checked at the largest text size.
- **Themes:** the outline is the theme's `--card-ink` and the text white, so
  contrast does not depend on the felt; checked in the four themes in the browser.

## Tests

`frontend-tests/clean-headings.test.cjs` reads the stylesheet: `h1` line height ≥
1; no heading outside the home hero has a drop shadow offset above 2 px; the thin
outline has no drop; the small-text selectors use it. The result is checked in a
browser at 375 px in the four themes, at normal and largest text size.
