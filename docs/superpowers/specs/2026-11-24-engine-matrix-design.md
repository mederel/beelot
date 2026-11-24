# Browser tests in WebKit and Firefox (US-203)

Issue: #458. Builds on the device matrix (US-202, `crates/beelot-server/web/e2e/devices.ts`) and the layout checks (US-201).

## Goal

A layout bug that exists only on an iPhone or in Firefox is found by CI, without a maintainer owning the device. The layout
checks of the key screens run in WebKit and Firefox as well as Chromium.

## What exists

`devices.ts` lists 14 sizes; `playwright.config.ts` builds one project from each; `useOf()` drops the descriptor's
`defaultBrowserType`, so every project runs in Chromium.

## Design

### The engine in the device list

`Device` gets an optional `engine: "webkit" | "firefox"` (absent means Chromium). `useOf` passes it to Playwright as
`browserName`; for a descriptor it no longer strips the engine, it sets it from the entry. An entry with an engine is a
*separate* entry with the engine as a name suffix, so the 14 Chromium projects keep their names.

New entries (each with its `reason`, as every entry has):

| Project | Engine | Why |
|---|---|---|
| `iphone-390-webkit` | WebKit | an iPhone in portrait: the engine of every iPhone browser |
| `phone-landscape-844-webkit` | WebKit | an iPhone on its side (the dynamic toolbars of Safari change the height) |
| `phone-landscape-667-webkit` | WebKit | the shortest iPhone on its side |
| `tablet-768-webkit` | WebKit | an iPad |
| `narrow-320-firefox` | Firefox | a phone-sized viewport (see below) |
| `desktop-firefox` | Firefox | Firefox on a desktop |

Firefox cannot emulate touch or `isMobile`. The phone-sized Firefox project is therefore a 320×568 viewport with
Playwright's default desktop profile; the tests that need a touch screen (the 44 px targets, `matrix.spec.ts`'s
"touch and profile" checks) are skipped there, the reason written in the test, never silently.

### The smaller set

Outside Chromium, projects run only:

- `key-screens.spec.ts` and `auction-layout.spec.ts` (the US-201 checks on the key screens);
- `solo-round.spec.ts`, on WebKit only (one scripted solo round);
- `matrix.spec.ts` and `layout.spec.ts` (they need no server and guard the matrix and the helper).

`sweep.spec.ts` and the Firefox solo round are excluded by `testIgnore`/`testMatch` on the entry (data, not a list in the
config): each `Device` gets an `only?: RegExp` for the specs it runs, and the config reads it. A test that cannot pass in an
engine uses `test.skip(browserName === "…", "reason")`.

### Differences found

Fixed when the cause is ours (CSS, markup). Listed with their cause in a comment at the top of the test file when it is an
engine bug. A large or risky fix gets its own commit.

### Content security policy

No change: the server's and the page's CSP checks run in every engine they are already part of; the new projects only add
engines to the specs that contain them.

### CI

The browser job installs `chromium webkit firefox` (`npx playwright install --with-deps chromium webkit firefox`). The run time
is compared with the current 14.5 minutes of the full suite and written in the pull request.

### The test that notices a missing project

A test in `matrix.spec.ts` (no server needed) runs `playwright test --list --reporter=json` and fails if a name of
`DEVICES` is missing from the projects of the report, or a project of the report is not in `DEVICES`. Together with the
existing check that the list and the engines agree, a matrix entry cannot be dropped silently.

## Not covered

- The Android WebView on a device (US-209).
- Running the whole suite in every engine (a deliberate choice for run time).

## Verification

`cargo`-side nothing changes. Frontend: `npm run check`, `lint`, `test`, and the Playwright runs of the new projects against a
local server (Docker and Playwright's WebKit and Firefox builds are needed); what cannot be run locally is reported as such
and left to CI.
