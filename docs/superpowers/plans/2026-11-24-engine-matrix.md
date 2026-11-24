# Browser tests in WebKit and Firefox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the layout checks of the key screens in WebKit (iPhone, iPad) and Firefox, beside the 14 Chromium sizes (US-203, #458).

**Architecture:** `Device` in `e2e/devices.ts` gets an `engine` and an `only` (the specs it runs); `playwright.config.ts` turns both into `browserName` and `testMatch`. Six new entries, named with the engine as suffix. A test in `matrix.spec.ts` compares `playwright test --list` with `DEVICES`.

**Tech Stack:** Playwright 1.65.1, TypeScript, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-24-engine-matrix-design.md`

## Global Constraints

- Chromium project names stay as they are (14 projects, one entry per size).
- New entries: `iphone-390-webkit`, `phone-landscape-844-webkit`, `phone-landscape-667-webkit`, `tablet-768-webkit`, `narrow-320-firefox`, `desktop-firefox`; each has a `reason`.
- Outside Chromium the specs are `key-screens`, `auction-layout`, `matrix` and `layout`; `solo-round` on `iphone-390-webkit` only; never `sweep`.
- A test that cannot pass in an engine is skipped there with its reason written in the test.
- No text of the page changes without `t()`; `crates/beelot-server/static/` is rebuilt and committed only if `web/src` changes.
- Playwright's Firefox and WebKit builds are not installed on the author's machine and must not be installed there (disk): the engine runs are verified by `playwright test --list` locally and by CI.

## Review Focus

- A matrix entry dropped from the config: the list test fails, naming the project.
- A required Chromium size is duplicated by an engine entry: the size test counts Chromium entries only.
- Firefox has no touch: the touch checks do not judge it (they key on `(pointer: coarse)`), and the matrix test expects a mouse there.
- The list test spawns Playwright: it runs on `desktop` only, so 20 other projects do not each spawn it.

---

### Task 1: The engine in the device list and the config

**Files:**
- Modify: `crates/beelot-server/web/e2e/devices.ts`, `crates/beelot-server/web/playwright.config.ts`
- Test: `crates/beelot-server/web/e2e/matrix.spec.ts`

**Interfaces:**
- Produces: `Device.engine?: "webkit" | "firefox"`, `Device.only?: RegExp`; `useOf(device)` returns `browserName` (`"chromium"` when `engine` is absent).

- [ ] **Step 1: Write the failing tests in `matrix.spec.ts`**
  - `REQUIRED` test: filter `DEVICES` to entries without `engine`; add a test "the engine entries are the six of the story" asserting the sorted names equal the six names of Global Constraints and that each has `only`.
  - In "each project runs its device": add the `browserName` fixture and `expect(browserName).toBe(device!.engine ?? "chromium")`.
- [ ] **Step 2: Run** `npx playwright test e2e/matrix.spec.ts --project=desktop` — expect FAIL (no engine entries).
- [ ] **Step 3: Implement** in `devices.ts`: the two fields; `useOf` sets `browserName: device.engine ?? "chromium"` (still dropping the descriptor's `defaultBrowserType`); the six entries (WebKit ones on the descriptors iPhone 14, iPhone 14 landscape, iPhone SE landscape, iPad Mini; Firefox ones with no descriptor, 320×568 and 1280×800). One shared `LAYOUT_SPECS = /[\\/](key-screens|auction-layout|matrix|layout)\.spec\.ts$/`; `iphone-390-webkit` adds `solo-round`. In the config: `testMatch: device.only`, and `testIgnore` for `solo-round` only when neither `longRound` nor `only` is set.
- [ ] **Step 4: Run** `npx playwright test --list | tail -3` — expect the six new projects listed with the spec files of the table above and no `sweep`; `npx playwright test e2e/matrix.spec.ts --project=desktop` passes.
- [ ] **Step 5: Commit** `feat: run the key screens in WebKit and Firefox (US-203)`.

### Task 2: The test that notices a missing project

**Files:**
- Modify: `crates/beelot-server/web/e2e/matrix.spec.ts`

**Interfaces:**
- Consumes: `DEVICES` (Task 1).

- [ ] **Step 1: Write the test** "the projects of the config are the devices of the list, none missing": skipped unless `info.project.name === "desktop"` (reason: one run of `playwright test --list` is enough); runs `execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"])` and compares the sorted `config.projects[].name` of the JSON with the sorted `DEVICES` names; the failure message names the missing and the extra ones.
- [ ] **Step 2: Run** `npx playwright test e2e/matrix.spec.ts --project=desktop` — expect PASS; then temporarily remove one entry from the config's map and expect FAIL naming it; restore.
- [ ] **Step 3: Commit** `test: fail when a project of the matrix is missing from the reports (US-203)`.

### Task 3: CI and docs

**Files:**
- Modify: `.github/workflows/build.yml` (step "Install the browser"), `pages/docs/develop.html:69`

- [ ] **Step 1:** CI installs `chromium webkit firefox`; the develop page says the tests run in Chromium on 14 sizes and in WebKit and Firefox on the key screens, and `npx playwright install chromium webkit firefox` once.
- [ ] **Step 2: Run** `npm run check && npm run lint && npm test` in `web/` — expect all pass.
- [ ] **Step 3: Commit** `ci: install WebKit and Firefox for the browser tests (US-203)`.

### Task 4: Pull request

- [ ] Fetch `main`, rebase the branch on it, push, open the PR `feat: run the browser tests in Safari's and Firefox's engines (US-203)` with `Closes #458`, turn on auto-merge (`gh pr merge <n> --auto --squash`), and watch the checks; fix a failure of an engine with a new commit (a real layout difference is fixed in `web/src` with `npm run build` and `static/`, or listed with its cause at the top of the test file).
