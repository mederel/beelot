# Design: compare screenshots of the key screens (US-205)

## Problem

The layout checks (US-201) say that nothing is clipped, overlapping or too small. They do not say that the screen still
*looks* as it did: a colour, a spacing, a font weight or an icon that changed without anyone meaning it passes them. A
reviewer reading a diff of CSS cannot see it either.

## Decision

`web/e2e/screenshots.spec.ts` takes a screenshot of each key screen on six sizes and compares it, with Playwright's
`toHaveScreenshot()`, to the approved image committed beside the tests. A changed image fails the job; approving the change is
committing the new image with it.

### What is photographed

| | |
| --- | --- |
| Screens (English, all six sizes) | the home, the setup sheet, the auction, mid-trick, the round result, the match end, the lobby, settings |
| Other languages (every size) | the auction in French, the round result in Dutch |
| Sizes | 320×568, 375×667, 390×844, a landscape phone (844×390), a tablet (768×1024), a desktop (1280×800): the entries `narrow-320`, `phone-375`, `iphone-390`, `phone-landscape-844`, `tablet-768` and `desktop` of `devices.ts`, at a pixel ratio of 1 |

That is 8 × 6 + 2 × 6 = 60 images of the viewport (what a player sees, not the page's full height). Chromium only: the engines
are the layout checks' business (US-203).

### What is frozen

- **Motion**: the page's effects setting is off (`fixtures.ts`), the screenshot asks for `animations: "disabled"` and hides the
  caret.
- **The deal**: every table is a recorded snapshot of `tests/contract/` (the recorded deals of `fixtures/` are what produced
  them), served from the page's side by `mock.ts`. No server game is played.
- **The clock**: `page.clock.setFixedTime` fixes `Date` to one instant, so that no date or "x minutes ago" changes.
- **Faces and names**: the bots' faces are drawn from their names, and the names are in the snapshots; a guest is "Ana".
- **Fonts**: the page serves its fonts itself (`@fontsource`), and the screenshot waits for them.

### One container for the images

Fonts' hinting and anti-aliasing differ by machine, so the images are made and compared only in Playwright's Docker image of
the version of `@playwright/test` in `package.json` (`mcr.microsoft.com/playwright:v<version>-noble`; the version is pinned
exactly, and a test fails if it is not). `.github/scripts/screenshots.sh` runs the screenshot tests in that image against the
server on the host; CI runs it, and so does a contributor: `.github/scripts/screenshots.sh --update-snapshots` regenerates
the images. The wrapper hands the files back to the caller's user.

The screenshot spec has a config of its own (`playwright.screenshots.config.ts`, one project `screens-<size>` per size, images in
`e2e/screenshots/<project>/`); the main config ignores the spec, so `npm run e2e` is not slowed down or made to fail by
a machine's fonts.

### CI

A job `screenshots` (needs `build`, runs when `browser` does) starts the database and the server as `browser` does and runs the
wrapper. It never passes `--update-snapshots`. A failure uploads `test-results` (the expected, actual and diff images of each
failed screen) as `screenshots-failure`. A last step proves the job can fail: it runs one test with
`BEELOT_SCREENSHOT_SABOTAGE=1`, which moves the page by a few pixels, and fails if that run *passes*.

### Approving a diff

`pages/docs/develop.html` says: open the diff images of the run; if the change is what the pull request meant, regenerate the
images with the wrapper and commit them with the change; if not, fix the page. Images are never updated by CI.

### Size

The 60 PNGs are under 20 MB together; a test of the repository fails when they are not, and when a size misses a screen.

## Tests

- `tests/screenshots.test.ts` (Vitest): Playwright's version is exact, the wrapper takes its image from it, every project has
  every image, the images weigh under 20 MB.
- `e2e/matrix.spec.ts` keeps passing: the main config does not run the spec.
- The job itself, and its deliberate-difference step.

## Out of scope

A hosted review service (Chromatic, Percy); other engines; the full height of scrolling pages.
