# Explain the score figures (US-109) — design

## Goal

The round points under each team's score say what they are: "+0" becomes "+0
manche", visually and for screen readers (`docs/product-backlog.md`, US-109).
Frontend only, in `crates/beelot-server/static/`.

## Today

`.round-points` shows a bare "+55". Its only explanation is a `title` tooltip
("Points de la manche"), which touch screens never show and screen readers do not
reliably read.

## Decisions

- **The label is part of the figure's text:** the element reads "+55 round"
  (FR "+55 manche", NL "+55 ronde"). Being real text it is visible everywhere
  and is read by screen readers with the number. The tooltip is removed (it would
  be read twice) with its now unused translations.
- **A pure `roundPointsText(points, label, format)`** in `score-bar.js` builds
  the text (`""` when there is no round in progress), so the count-up animation
  and the plain write use the same text. `showScoreNumber` takes a text function
  instead of a prefix.
- **The count-up keeps `aria-hidden` while it runs,** so a screen reader hears
  the label with the final figure only (existing behaviour, unchanged).
- **The phone chip keeps its two lines:** the label sits on the second line, next
  to "You"; the chip text stays within the 360 px bar (checked in the browser).
- The match score announcement (live region) is unchanged: it leaves round points
  out on purpose.
- Texts: "round" → "manche" → "ronde". Replaces "Round points".

## Tests

`frontend-tests/score-labels.test.cjs`: `roundPointsText`, that the tooltip is
gone, and the FR/NL texts. The chip is checked in a browser at 360 and 375 px and
on desktop.
