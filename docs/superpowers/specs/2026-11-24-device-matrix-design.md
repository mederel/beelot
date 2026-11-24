# Design: browser tests on the sizes of the devices that exist (US-202)

## Problem

The browser tests ran on five sizes (320, 375, 412 and 915 px wide, and a 1280 px desktop). A layout that breaks at 360, 430,
768 or 2560 px, or on a phone as short as 375 px, passed them.

## Decision

### One list of sizes

`web/e2e/devices.ts` is the list, one line a device: name, width, height, **reason**, and where it applies the Playwright
descriptor to use. `playwright.config.ts` makes one project of each entry (`useOf`), so adding a device is adding a line.

| Project | Size | Profile | Reason |
| --- | --- | --- | --- |
| `narrow-320` | 320×568 | iPhone SE | smallest iPhone still sold |
| `android-360` | 360×640 | explicit Android | common small Android |
| `phone-375` | 375×667 | iPhone 8 | the 375 px design width |
| `iphone-390` | 390×844 | iPhone 14 | most common iPhone width |
| `android-portrait` | 412×915 | explicit Android | Pixel, large Androids |
| `iphone-430` | 430×932 | iPhone 14 Pro Max | widest iPhone |
| `tablet-768` | 768×1024 | iPad Mini | tablet portrait |
| `phone-landscape-667` | 667×375 | iPhone SE landscape | shortest screen |
| `phone-landscape-844` | 844×390 | iPhone 14 landscape | shortest screen |
| `android-landscape` | 915×412 | explicit Android | large Android on its side |
| `tablet-landscape-1024` | 1024×768 | iPad Mini landscape | tablet on its side |
| `desktop` | 1280×800 | none | laptop |
| `desktop-1920` | 1920×1080 | none | full-HD monitor |
| `desktop-2560` | 2560×1440 | none | large monitor |

Phones and tablets take Playwright's descriptor (user agent, touch, pixel ratio, `isMobile`); the size is the story's, not the
descriptor's (whose viewport is the one under Safari's bars: bars are US-206). The descriptor's engine is dropped: the tests run
in Chromium until US-203. The Android profiles, which Playwright does not know, keep an explicit user agent and pixel ratio.

### Which tests run where

The layout checks (US-201) run on every project. The long solo round (`solo-round.spec.ts`, minutes) runs on four: `narrow-320`,
`phone-landscape-667`, `tablet-768` and `desktop` (`longRound` in the list; the others `testIgnore` it).
The whole suite (592 tests on 14 projects) took 14.5 minutes on 4 workers against a real server, under the job's 30-minute limit, so
the job is not sharded; if it nears the limit, it is split with `--shard`, no project is dropped.

### The sweep

`sweep.spec.ts` sets the width itself, from 320 to 1280 px in steps of 40 px, at heights 568 and 900, on the home page, the
setup (`/play/bot`) and the table (the recorded mid-trick), and applies `expectLayout`. It runs on one project (`phone-375`,
a touch profile that judges targets too), since the sizes it visits are its own. A failure lists every size that broke.

### Tests

`matrix.spec.ts` (no server): the list holds each size of the story once, with reasons; the long round is on the four projects;
each project's viewport, touch, pixel ratio and user agent are its entry's. The sweep is the second test.

## What the matrix found

- On a touch screen wider than 1024 px, the six reactions of the side tray were 40 px tall; they are 44 px, and in two columns on a
  screen under 700 px high, where the tray reached the header's status row (found by the sweep).
- On a 1024×768 tablet the guest's "Sign in" pill covered the table header's hint button: the header's room for the pill (US-201)
  stopped at 62 rem, and the centred 52 rem header leaves the corner free only from 67 rem.

## Out of scope

Other engines (US-203), long texts and fonts (US-204), screenshots (US-205), phone bars (US-206), accessibility (US-207), load
time (US-208), real devices (US-209), documentation (US-210).
