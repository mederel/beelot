# Design: try Beelot on real devices before a release (US-209)

## Problem

The browser checks (US-201 to US-208) run in Chromium, WebKit and Firefox on emulated sizes. Emulation does not show real
touch, the device's own fonts, the browser's bars that come and go, the on-screen keyboard or a slow GPU. Nobody looks at a
real phone before a release, so a fault there is found by a player, with no date to tell when it came.

## Goals

- A short checklist a person follows on five real devices in about fifteen minutes.
- The US-201 layout checks run on at least three real devices of a cloud service, on a release candidate, when someone asks.
- Each run leaves a dated record (devices, date, version, what was found) on the pull request or the release.

Non-goals: a device lab of the project's own; running on every pull request; making the cloud run a required check.

Anti-goals: a workflow that fails, or leaks anything, when the service's secrets are absent (forks, a fresh clone of the
repository); a dependency the size of the service's SDK (576 MB) in every developer's `npm ci`.

## Approaches

| Service | Real phones for Playwright | Verdict |
|---|---|---|
| **BrowserStack Automate** | Android (Chrome) and iOS (Safari) real devices, Playwright through its Node SDK, a tunnel (BrowserStack Local) to a server on the runner | **Chosen** |
| Sauce Labs | Playwright on desktop VMs only (`saucectl`); real devices only for Appium and Espresso/XCUITest | The tests would need rewriting |
| Firebase Test Lab | Android only; instrumentation or Robo tests, no Playwright, no iPhone | No Safari, no reuse of the tests |

BrowserStack is the only one that runs the existing `e2e/` specs unchanged on a real iPhone and a real Android phone. It
offers a free plan for open-source projects. Its SDK (`browserstack-node-sdk`) is large (576 MB installed: it brings googleapis
and the AWS and Kubernetes clients), so it lives in a folder of its own, `real-devices/`, with its own `package.json` and lock, like
`lighthouse/` (US-208): only the workflow installs it.

## Decision

### The checklist

`docs/real-devices.md`, linked from `pages/docs/release.html`, lists five devices with the reason each is there, the steps
(about fifteen minutes a device) and what to look for, plus a form for the record. The steps are those of the story: install
the app (the Android app of Phase 9, or the home-screen web app on iOS), play a solo round to the end in both orientations,
open the keyboard on the sign-in panel, switch the language, join a private table from a second device, and lose and regain
the network (US-141).

### The cloud run

- `real-devices/lib.mjs` holds the device list (`DEVICES`: an iPhone with Safari and two Android phones with Chrome, ones
  BrowserStack lists for Playwright), writes the SDK's `browserstack.yml` from it (`browserstackConfig`), and writes the
  record of a run (`report`).
- `crates/beelot-server/web/playwright.real-devices.config.ts` runs the US-201 layout checks, `pages.spec.ts` and
  `key-screens.spec.ts`, with no emulated size: the device's own screen. The page is `http://bs-local.com:8080`, BrowserStack
  Local's name for the runner (Safari on iOS cannot reach `localhost` through the tunnel).
- `.github/workflows/real-devices.yml` is started:
  - by hand (`workflow_dispatch`), on any ref, with two optional inputs: a pull request number and a release tag, where the
    record is written;
  - when the label `release-candidate` is added to a pull request: the record is a comment on it.

  It never starts on other pull request events. A first job, `secrets`, reads `BROWSERSTACK_USERNAME` and
  `BROWSERSTACK_ACCESS_KEY`; when either is empty it writes a notice and the `devices` job is skipped, so the run succeeds
  having done nothing. Otherwise `devices` builds the server, starts it with its database (the same
  start as the `browser` job of `ci.yml`: the database answers over TCP before the server starts), runs the
  specs through the SDK on the devices, and writes the record to the job's summary, then to the pull request or the release
  notes (`gh release edit`, appended to the notes). The record says the result of the automated run and leaves a line for
  what the person found on the checklist.
- The version in the record is the next version (`next-version.sh`) and the commit, since a release candidate is a commit of
  `main` or of a pull request before it is released.

### Tests

- `real-devices/tests/lib.test.mjs` (run by `ci.yml`'s `lint` job next to the Lighthouse tests): at least three devices with
  an iPhone and an Android phone; the YAML enables the tunnel and holds no credential; the record names the devices, the date,
  the version, the commit and the result; the workflow starts only on `workflow_dispatch` and the `labeled` event, and skips
  `devices` without the secrets; `release.html` links the checklist.
- The workflow itself is run on this story's branch with the secrets absent: the `release-candidate` label is added to its
  pull request, and the run must succeed with `devices` skipped.

## Left to the builder

- The SDK's exact support of the Playwright version of `web/` (1.65.1) is checked on the first run with credentials. When
  BrowserStack refuses it, the record shows a failure, not a silent pass.
- The device names follow BrowserStack's list; when a device is retired, change `DEVICES`.

## Setup (once, by the owner)

Ask BrowserStack for the open-source plan, then add the repository secrets `BROWSERSTACK_USERNAME` and
`BROWSERSTACK_ACCESS_KEY`. `pages/docs/release.html` says so.
