# Design: what a phone's browser does to the page (US-206)

## Problem

A phone's browser changes the screen under the page: a notch and a home indicator take the edges, the keyboard takes almost half the
height, the address and tool bars hide and show as the player scrolls, and the phone turns. The layout checks (US-201 to US-204)
judge a fixed window; none of them moves it. A control under the notch, a submit button behind the keyboard or a hand pushed
off-screen by the bars would pass them all.

## Decision

Source rules for what a test of the sources can say, and `web/e2e/phone-browser.spec.ts` for what needs a browser. The tables are the
recorded snapshots of `tests/contract/`, served from the page's side (`mock.ts`), so each screen is reached in one step.

### The source rules (`tests/source-rules.test.ts`)

- No `vh` length in the sources or in `index.html` (`dvh`, `svh` and `lvh` are allowed): `vh` is the height with the bars hidden.
  The rule goes beyond `100vh`, because the table's card sizes (`9vh`, `12vh`) had the same fault; they are `dvh` now.
- `index.html` (and the built copy in `static/`) declares `viewport-fit=cover` and carries no `user-scalable=no` or `maximum-scale`.
- Each rule has a test that it catches the bad forms and lets the good ones through.

### The browser cases

The cases run in the Chromium phone projects; the ones that need no Chromium-only feature also run in WebKit's (`devices.ts`).

- **Insets.** Chromium's `Emulation.setSafeAreaInsetsOverride` gives the page `env(safe-area-inset-*)`: 47 px at the top and 34 px at
  the bottom in portrait; 47 px at each side and 21 px at the bottom in landscape. On seven screens (home, setup sheet, crew tab,
  settings, auction, mid-trick, round result) no visible control may reach into those bands. A page that scrolls is looked at at its
  top for the top and the sides, and at its end for the bottom (every scroller, a sheet included, is scrolled); a control in a scroller
  made for it (a row of chips) is judged by the scroller. A self-test puts a control under the notch and expects the check to find it.
  Only Chromium can emulate the insets, so only Chromium runs it; a separate test reads `viewport-fit=cover` in every engine.
- **The keyboard.** The focused field is given the focus, the viewport loses 45% of its height, and the field is scrolled into view
  the way a browser does. The field and the button that submits it must be entirely in view: the join form (name, the six code boxes,
  Join), the display name of Settings (and Save), and the sign-in panel (its buttons). On every portrait phone project, which includes
  375×667 and 360×640. A viewport that is 45% shorter is what Android does when the layout viewport resizes and what the visual
  viewport shows on iOS; Playwright cannot raise a real keyboard.
- **The bars.** In the middle of the Classic auction the height grows by 56 px (the bars hide), returns (they show), twice. After
  each step the layout invariants of US-201 hold, and the hand and the auction panel lie between the top and the bottom edge.
- **Rotation.** In the middle of a trick the viewport's width and height are swapped and swapped back (Playwright has no orientation
  change). At each step the invariants hold and the page's address, the hand's cards and the trick are the same.
- **Zoom.** The source rule keeps zoom enabled. The page at 200% is already checked by US-204 (the font at 200% and the page zoomed
  to 200% at 1280 px), which this story does not repeat.

## What the checks found

Fixed, with the rebuilt `static/`:

- the page, the sheets, the account button, the lobby and the close button ignored the left and right insets: on a landscape phone
  the page's text, the "Sign in" pill and the sheet's close button sat under the notch. They pad with `env(safe-area-inset-left|right)`;
- the auction panel's room did not count the notch or the home indicator, so the hand's cards ran under the home indicator on a
  landscape phone: `--auction-reserve` adds both insets, and the table's bottom padding keeps the fanned hand clear of it;
- the join form, the display-name form and the public-table form left the Join and Save buttons behind the keyboard after the
  browser scrolled to the field: `keepInView` scrolls the form into view when the viewport resizes while a field of it has the focus;
- the card sizes of a landscape table used `vh`: they use `dvh`.

## Out of scope

Real devices and a real keyboard (US-209), and the screenshots (US-205).
