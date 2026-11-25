# Design: measure how the page loads on a slow phone (US-208)

## Problem

The layout checks (US-201 to US-207) prove the page fits and can be used on every device; none proves it arrives soon. A page that
shows correctly after eight seconds on a low-end phone and a poor network is not displayed correctly for the player who waits.
The page is a Svelte application of about 350 kB of script and 100 kB of style, served without compression, so a regression
(a library, an image, a loop at start-up) is easy to make and invisible on a developer's laptop.

## Decision

### Lighthouse CI, on the built page

`lighthouse/` (its own `package.json` and lock, so that the frontend's `npm ci` does not install Lighthouse) holds Lighthouse CI
0.16.1, pinned. `node lighthouse/run.mjs` makes a solo table on the running server, then audits three pages with the mobile profile
written out in `lib.mjs` (not left to Lighthouse's default): a 4× slower CPU, 150 ms of round trip and 1.6 Mbit/s (slow 4G), simulated
throttling, three runs a page, the median run judged.

- the home page, `/`;
- the setup sheet, `/play/bot`;
- a solo table, `/play/bot/bidding/<id>`: Lighthouse loads each page in a fresh load, so `session.cjs` (Lighthouse CI's
  `puppeteerScript`) gives the browser the resume record the page writes when it makes a table (`beelot.resume`, in `localStorage`),
  and the page resumes the table as it does for a returning player. The other two pages are measured as a new visitor sees them.

### Budgets, in `lighthouse/lighthouserc.json`

| Budget | Value |
|---|---|
| Performance score | at least 85 |
| Largest contentful paint | under 2.5 s |
| Total blocking time | under 300 ms |
| Cumulative layout shift | under 0.1 |
| Script transfer | 400 000 bytes |
| Style transfer | 120 000 bytes |

The sizes are the current ones plus 15% rounded up: the page loads `app-*.js`, `csrf-*.js` and `telemetry-*.js` (346 kB) and
`style-*.css` (104 kB). The server does not compress, so the transfer is the file's size. The measurements the numbers were
taken from are in the file's `_measured` section and in the job's summary (the median of each page, printed after every run).

The budgets are rounded up on purpose: a runner is noisy. A budget therefore blocks only when it fails **twice in a row**: `run.mjs`
runs the whole measurement again when a budget fails, and exits with an error only when the second run fails too. The report of the
last attempt (HTML and JSON of each run) is the job's artifact `lighthouse-report`.

### The shift is also a browser test

`e2e/layout-shift.spec.ts` (Chromium, on `phone-375` and `desktop`) records `layout-shift` entries (those without a recent input)
through a `PerformanceObserver` while a player plays on a real server: a card played and the trick that follows, the settings sheet
opened, and the language changed. Each step must add a shift under 0.02 (near 0): the controls under a finger do not move.

### The job must be able to fail

`node run.mjs --sabotage` audits the same pages through a proxy that adds a 600 kB script which keeps the main thread busy for a second
and a half. The command exits with 0 only when a budget refused it. The CI job runs it after the real measurement, as the screenshots
job does with its moved pixels. `lighthouse/tests/` checks the pieces that need no browser: the configuration given to Lighthouse CI,
the two attempts, the failure report and the summary, and that `lighthouserc.json` holds the story's budgets.

## CI

A job `lighthouse` (needs `changes` and `build`, runs when the Rust or the frontend changed, and when `lighthouse/` does), starts the
database and the release server like the browser tests, uses the runner's Chrome, runs the measurement, then the sabotage, and uploads
the reports. It is in the `needs` of the `ci` job. The scripts' own tests run in the `lint` job.

## Out of scope

Real devices (US-209). A trend over time, a hosted Lighthouse server and a performance budget for the other screens.
