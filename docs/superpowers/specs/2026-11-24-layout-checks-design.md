# Design: layout checks in the browser tests (US-201)

## Problem

The browser tests (`web/e2e/`) check that a page loads and, in `pages.spec.ts`, that it does not scroll sideways. A control pushed
off the screen, hidden under another one, or too small to tap passes them. Two of them were found by players and fixed one by one
(#253, #254), each with a measurement written for that case only.

## Decision

One helper, `web/e2e/layout.ts`, asserts four invariants on the page as it is. A test calls `expectLayout(page, step, options)`
after each step of a flow.

| Invariant | What fails |
| --- | --- |
| `scroll` | `scrollWidth` is larger than `clientWidth`, or an element is wider than the viewport. |
| `clipped` | A visible button, link, input or card of the hand lies outside the viewport (the bottom too, on a screen that does not scroll), or is cut by an ancestor that hides its overflow. Inside a scrollable container it may lie beyond the container's edge, but the container must be on screen. |
| `overlap` | The hand meets the auction panel, the played cards or the scores; two interactive elements overlap; or the middle of an element is reached by another element. |
| `touch` | On a touch profile (`pointer: coarse`) an interactive element is smaller than 44×44 CSS pixels. |

A failure reads `layout of "<step>" at 375×667` and lists `invariant: role "name" [selector] — numbers`, for example
`touch: button "Pass" [.btn.secondary] — 270px×40px, under 44×44px`.

### What is not a fault

- **Overlays.** What is under an open dialog, or under the auction, lobby or result panel, is the page below an overlay: it is
  not judged. Elements inside the overlay are judged against each other.
- **Fixed bars.** A bar fixed to the screen (the tabs) covers the page that scrolls under it. An element it covers now is not
  covered if the page can scroll it clear (below the bar at the end of the page, above it at the start).
- **The hand.** The cards of a hand overlap by design, each over the one before it. Their touch target is the strip that shows,
  so only the height is judged.
- **Hidden parts.** An element in a scrolling panel that is below the panel's fold covers nothing until it is scrolled to: the
  overlap checks use the part of an element that can be seen.
- **The skip link**, which waits above the page until the keyboard focuses it (`STANDING_EXEMPTIONS`).
- **Animations.** The helper waits until no animation that ends has run for 200 ms, so that a panel is measured where it settles.

### Exemptions

A test may exempt elements from one invariant with `{ selector, invariant, reason, below? }`. The reason is required and is
written for a reviewer; `below` limits it to screens narrower than that many pixels, so that an exemption for the smallest phones
does not excuse the others. The exemptions of this story are in `pages.spec.ts` and `key-screens.spec.ts`.

### Self-test

`layout.spec.ts` serves a page that overflows, clips, overlaps and has a small target, and checks that each is named; a page that
fits, with a scrollable strip and an overlay, passes; an exemption silences only its invariant and its elements. It needs no
server.

## The key screens

`key-screens.spec.ts` drives each screen to its state and calls the helper. Tables are the recorded snapshots of
`crates/beelot-server/tests/contract/`, served from the page's side (`e2e/mock.ts`), so a state such as the match end is reached
in one step and is the same on every run and size: the Classic auction; the Contrée auction with the coinche; mid-trick; the
round result and its review; the match end; a private table's lobby from two browser contexts; the crew and friends tab; the
statistics (with a record and as a guest); the leaderboard; settings; the Me tab with the sign-in panel; privacy; the tutorial;
the setup sheets and the rules sheet. `pages.spec.ts` calls the helper on every route. `auction-layout` and `partner-seat` call it
on the live game and on the recorded trick; `partner-seat` keeps its centre-line measurement, which is not one of the four
invariants.

The tutorial's coached table (US-199) needs the server's tutorial table, which has no recorded snapshot yet: the lessons page is
checked, the coached table is left to the story that records one.

## What the checks found

The first run failed on real faults. Fixed, with the rebuilt `static/`:

- the tabs of Statistics and Leaderboard sat under the "Sign in" pill on a narrow screen;
- the crew tab (320 px) was 2 px too wide because a full-width button's label padding set the width of its box; and, signed in,
  the friend rows were 40 px too wide;
- the statistics (320 px) were 7 px too wide: the ring and the three tiles do not fit side by side;
- the round review's buttons were below the screen on a landscape phone (the review now scrolls);
- on a touch screen, small buttons, the account button, the tabs of Progress, the sheet's close button, the switches, the lobby's
  "Sit here", the round result's "Details", and the footer links are 44 px high now (the switch's track is still 32 px: its button
  is taller around it).

Left as exemptions, each with its reason in the test:

- the auction panel's choices (38 to 43 px tall) shrink with the screen so that the hand stays in view (#253);
- the six boxes of the invitation code on a 320 px screen (37×47 px: six 44 px boxes need 284 px, the card leaves 248 px);
- **a fault that needs a design decision:** on the table of a narrow portrait screen the guest's "Sign in" pill (US-200) is over the
  header's hint button and part of the right score. A header with room for both costs the 52 px that the hand needs on a
  320×568 screen. On a landscape phone or a tablet (600 to 992 px) the header now leaves room for it.

## Out of scope

Other engines (US-203), other sizes and devices (US-202), the biggest fonts (US-204), screenshots (US-205), the phone browser's
own bars (US-206), accessibility (US-207), load time (US-208), real devices (US-209) and the documentation of how to add a device
(US-210).
