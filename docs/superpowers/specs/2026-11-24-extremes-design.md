# Design: the longest texts, the largest numbers and the biggest fonts (US-204)

## Problem

The layout checks (US-201) run in English on the recorded tables, whose names are "Ana" and "Luc" and whose scores are three
digits. A Dutch label, a 30-character name or a font set to 200% was never tested, and each of them can push a button off the screen.

## Decision

`web/e2e/extremes.ts` holds the worst-case content and a text check; `web/e2e/extremes.spec.ts` runs them.

### The worst-case fixture

`worstCase(snapshot)` takes a recorded snapshot of `tests/contract/` and makes it as bad as the story says:

- four distinct player names of 30 characters (`MAX_DISPLAY_NAME`), with accents and an emoji and no space to wrap at, replace the
  names of the seats, the auction, the trick and the sentences that quote them;
- a hand of eight cards; the scores, the round's points and the match's are 99 999;
- the round result lists four players with four announcements each;
- the invitation code is the widest the code allows (`WWMMWW`, six characters), and the friends of the crew tab and a request carry
  the same long names. The page has no "crew name" of its own: the longest name a player can give is what stands for it.

### The languages

`fixtures.ts` gets a `language` option (default `en`) that writes the stored language before the page loads. `extremes.spec.ts`
loops over `en`, `fr` and `nl` and, in each, drives the screens with `worstCase` and the mocked API of `mock.ts`: the Classic and
the Contrée auction, mid-trick, the round result and the match end, the lobby, the crew tab, the statistics and the leaderboard,
settings, the Me tab, the setup sheets, the rules, the tutorial and the privacy policy. The locators are CSS and test ids, so one
script serves the three languages. A first test checks the fixture itself (lengths, no space, an emoji, eight cards).

### The text check

`findTextFaults(page)` runs in the page and reports, for each button, link, tab, heading, label and summary that is drawn and not
behind an open dialog:

- **cut**: a box (or the run of text in it) whose text is wider or taller than the box when the box hides its overflow, unless the
  cut is made on purpose (`text-overflow: ellipsis`, a line clamp), or the text is for screen readers only (a one-pixel box);
- **wrapped**: more lines than the layout allows: 2 for a button, link or tab, 3 for a heading (options can change both). Only a
  label that is one run of text is counted: a card made of blocks (title and description), and the faces of playing cards, which
  print their rank in each corner, are layouts of their own.

`expectFits` runs the four invariants of US-201 and the text check, and fails with the element, the invariant and the numbers.

### The text sizes (Chromium)

- **The browser's default font size at 200%**: the Chrome DevTools protocol's `Page.setFontSizes` sets the default font size, which
  is what the browser's own setting does (a page that does not set the root font size follows it; every length of Beelot is in rem).
  The test checks that the root is 32 px, then that the setup sheet, settings, the crew tab and the rules fit at 1280 px.
- **The page zoomed to 200% at 1280 px**: a zoom halves the viewport in CSS pixels and doubles the pixel ratio, so the same
  screens are checked in a 640×400 window at a pixel ratio of 2.
- **Large text on a phone**: a 375×667 touch window with the default font at 24 px (150%, what an Android phone does when its font
  size is at the largest), the same screens and the auction.

"Stay inside the viewport and reachable by scrolling" is the `scroll` and `clipped` invariants: nothing makes the page wider than the
screen, and every control is in the viewport or in a scrollable container that is. These cases run in one project (they bring
their window size) and only in Chromium: Playwright has no font-size switch for the other engines. The language cases run in all
the projects, WebKit and Firefox included (`devices.ts`).

## What the checks found

Fixed, with the rebuilt `static/`:

- a button's label never wrapped (`white-space: nowrap`): a long label ("Download my data" in Dutch on a 320 px phone; any button at a
  larger font) made its card, then the page, wider than the screen. A button wraps to a second line now;
- the setup sheet's two columns (the variants and the bots) stayed two columns at a larger font, wider than the sheet: they are one
  column when two would be narrower than 8 rem;
- the picture of the cards on the home page is in rem and does not shrink with the font: at 200% it made the page scroll sideways.
  It is clipped to the page's width;
- a player name is 30 characters without a space: the cells of the daily deal's table and the line "Signed in as …" of Settings break
  it; the display-name field wraps under its label's button on a narrow screen;
- on a landscape phone the guest's "Sign in" pill (142 px in French) covered the hint button: the header leaves it 10 rem.
