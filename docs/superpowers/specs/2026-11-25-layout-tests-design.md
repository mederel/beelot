# Design: document how to test a screen's layout and add a device (US-210)

## Problem

Phase 22 (US-201 to US-209) built nine layers of layout checks: the four invariants, the device matrix, the other engines,
the worst-case texts, the screenshots, the phone's browser, accessibility, the slow phone and the real devices. What each one
catches, how to run one of them, and what to change to add a screen or a device is spread over the comments of
`e2e/*.spec.ts`, `e2e/devices.ts`, `develop.html` and `release.html`. A contributor who fixes a layout bug, or adds a screen,
must read all of it first.

## Goals

- One page, `pages/docs/layout-tests.html`, that says, for each layer, what it catches, where it lives and what it costs in
  CI time; how to run one project or one test against a running server; how to open a failure's trace and a screenshot's
  diff; how to add a screen to the key list; how to add a device to the matrix; how to regenerate the screenshots.
- The page is linked from the documentation's index (the shared navigation and the cards) and from `develop.html`.
- AGENTS.md's bug-fix rule says that a layout bug's regression test is its viewport added to the matrix, or its screen added
  to the layout checks, and points to the page.

Non-goals: changing a test, a device or a CI job; a page in French or Dutch (the documentation is in English).

## Decision

### The page

It follows the other documentation pages: the same head, header, shared navigation (a new entry, "Layout tests", after
"Develop and verify", on every page), `main.doc` and footer. Sections:

1. **The layers**: a table, one row a story, with what it catches, its files and its cost. The costs are measured on the
   last run of `ci.yml` on `main` (run 45682275549, the merge of US-209): the test time of each spec summed over the shards
   from the blob reports, and the wall-clock of the `screenshots` and `lighthouse` jobs. The shards run three workers each, so
   the wall-clock is about a third of the test time divided among the shards; the page says so and gives both where they differ.
2. **Run one project or one test locally**: the server as in AGENTS.md (`docker compose up -d --wait && cargo run -p
   beelot-server`, with `BEELOT_TRUST_FORWARDED_HEADERS=true`), `BEELOT_URL`, then `npx playwright test` with `--project`,
   a file and `-g`; `BEELOT_ENGINE`; the specs that need no server.
3. **Read a failure**: the trace kept on failure (`test-results/…/trace.zip`, `npx playwright show-trace`), the HTML report
   (`--reporter=html`, `npx playwright show-report`), the expected, actual and diff images of a screenshot, and the CI
   artifacts (`browser-report`, `browser-failure-<engine>-<shard>`, `screenshots-failure`, `lighthouse-report`).
4. **Add a screen**: `SCREENS` in `e2e/screenshot-list.ts`, its `SHOW` step in `e2e/screens.ts` (screenshots and
   accessibility), a test in `e2e/key-screens.spec.ts` with `expectLayout` (the layout checks, the other engines, the real
   devices), the unit test `tests/screenshots.test.ts` that pins the list, and the new images.
5. **Add a device**: one entry in `DEVICES` of `e2e/devices.ts` with its reason; what `matrix.spec.ts` pins (the story's sizes,
   the engine entries, the flags `longRound`, `accessibility`, `layoutShift`); `SCREENSHOT_SIZES` for screenshots; the cost.
6. **Regenerate the screenshots**: `.github/scripts/screenshots.sh --update-snapshots` in the pinned container, and when a
   diff is approved or the page is fixed, pointing to the section of `develop.html` that says it.
7. **A layout bug's regression test**: the viewport or the screen, as AGENTS.md says.

`develop.html` keeps its own sections and links to the page from the frontend's `npm run e2e` paragraph and from the
screenshots section. The README lists the page, as it lists every docs page (a test checks it).

### Tests

`frontend-tests/site.test.cjs` already checks that every relative link and anchor of every docs page resolves, that every
page has the shared navigation, and that the README links every page: the new page is held to all three without a change.
A new test checks what the story adds:

- the page is linked from `docs/index.html` (the navigation and a card), from `develop.html` and from AGENTS.md;
- it names each layer, US-201 to US-209, and has the sections the story lists (by their ids);
- every repository path it gives in a `<code>` (`e2e/…`, `crates/…`, `.github/…`, `lighthouse/…`, `real-devices/…`,
  `docs/…`) exists, so that the page cannot keep a file that was moved or renamed.

They run in the `lint` job with the site's other checks (`node --test crates/beelot-server/frontend-tests/*.cjs`).
