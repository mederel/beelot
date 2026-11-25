# Design: accessibility checks on every screen size (US-207)

## Problem

The layout checks (US-201 to US-206) prove a control is on the screen and big enough; none proves a player who uses a screen
reader, a keyboard, a forced-colours theme, a high-contrast setting or a "reduce motion" setting can use it. A small screen is where
those players lose a control first: a sheet that does not trap the focus, a button whose label is cut, a focus ring pushed off-screen.

## Decision

One browser spec, `web/e2e/accessibility.spec.ts`, on four sizes of the matrix of US-202, each flagged `accessibility: true` in
`devices.ts` (`phone-375`, `phone-landscape-844`, `tablet-768`, `desktop`); the other projects ignore it. It runs in Chromium: axe-core
and the media emulation are Chromium's. The screens are the eight key screens of US-201 and US-205, shown by the same helper
(`e2e/screens.ts`, moved out of the screenshot spec so that a screen is added in one place).

### Axe

`@axe-core/playwright` (a dev dependency, exact version) runs the rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and
`wcag22aa` on every screen, and on the sheet and the dialogs that open on top of them. A violation fails the test and names the rule,
the elements and axe's help. An exemption is written in the test: `{ rule, selector, reason }`; there is none unless one is needed.

### Keyboard

On each screen the test presses Tab until the focus comes back to where it began, and checks, at every stop: the element is visible
and inside the viewport, it shows a focus indicator, and it comes after the previous stop in the document's order (no positive
`tabindex`). It then compares the stops with the page's tabbable controls: each one is reached (a radio group counts once).
For an open sheet (the setup sheet) and the dialogs of the table (round review, match end): Tab and Shift+Tab, one more time than
there are stops, never leave the dialog; Escape (or the close button) closes it and gives the focus back to the control that opened it.

### The three media settings

- `prefers-reduced-motion: reduce`: before a screen loads, a recorder logs each animation and transition that starts, from the
  events `animationstart` and `transitionstart` and from `Element.animate`; the log must hold none that moves a control (a keyframe or
  property of `transform`, `translate`, `rotate`, `scale`, `top`, `left`, `right`, `bottom`, `inset` or a margin). Fades are fine.
  To honour the setting, the page reads it: without a stored choice of effects, the level is Reduced instead of Full when the system asks
  for less motion. An explicit choice of the player still wins.
- `forced-colors: active`: on each screen the four layout invariants hold, every button and field still has an edge (the browser
  removes backgrounds and shadows, so a button without a border is text with no shape), and the focus indicator is still drawn.
- `prefers-contrast: more`: axe's enhanced contrast rule (7:1) finds nothing on the screens; the page raises its text and borders under
  this setting. The contrast test of the palette in `tests/page.test.ts` stays.

### Orientation

Never locked, and never asked for. A source rule: the web manifest says `"orientation": "any"` and no source calls
`screen.orientation.lock`. A browser case: no key screen at any size contains text that asks to rotate the phone, and no call of
`screen.orientation.lock` happens while a screen loads.

## Out of scope

Real assistive technology (VoiceOver, TalkBack) is a person's job (US-209). WebKit and Firefox are not run: axe's results do not
depend on the engine and the emulation of the media settings is Chromium's.
