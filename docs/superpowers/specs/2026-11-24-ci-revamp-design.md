# CI revamp: one pipeline, built once, tested in parallel

Replaces `.github/workflows/build.yml` and `android.yml` with a pipeline whose jobs each do one thing, build each binary
once, and run the browser suite in parallel shards. `pr-title.yml` stays. The required checks (`ci`, `conventional`) keep
their names, so the "Protect main branch" ruleset does not change.

## Goal

- A pull request that changes code is checked in **10 minutes or less** of wall-clock time (today: 22 minutes before
  US-203, more since WebKit and Firefox joined the browser job).
- Every task the workflows do today is still done (the inventory below), on the same events, with the same secrets.
- The workflow reads as a graph of small jobs: one job, one purpose; the shared setup lives in composite actions instead
  of being copied six times.
- A push to `main` releases from the binaries the checks tested, instead of compiling them again.

## What exists (measured on run 45451139424, 2026-11-24, before the engines were added)

| Job | Time | Where the time goes |
|---|---|---|
| `browser` | 22 min 16 s | 20 min 44 s in `playwright test`: 1,283 tests (20 projects) on the default 2 workers of a 4-vCPU runner |
| `check` | 11 min 11 s | 7 min 05 s `cargo llvm-cov` (one MariaDB container per test binary, `tests/common/db.rs`); 56 s doctests (a second, uninstrumented build); 75 s cache restore; 46 s frontend |
| `package-build` amd64 | 8 min 25 s | 4 min 07 s observability stack; 51 s release build; 47 s apt install; the rest packaging and installs |
| `package-build` arm64 | 3 min 20 s | the same without the amd64-only steps |
| `arch` | 4–7 min | builds the PKGBUILD from source in an Arch container |
| `gentoo` | up to 2 h | only when the ebuild, its scripts or `Cargo.lock` change |

Problems besides the time:

1. **The browser job is serial.** One runner, two workers, three engines installed although each project needs one.
2. **The server is compiled four to six times per run**: debug in `browser`, instrumented in `check`, plain for doctests,
   release in each `package-build` leg, and on `main` again in `release` (amd64) and `release-arm64`.
3. **Copied blocks**: the rustup check and toolchain install (5×), the "Stop the run" step (5×), the Node 22 lookup in the
   tool cache (2×), `actions/setup-java` twice in a row in both Android jobs.
4. **Unrelated work in one job**: `check` lints Rust, tests Rust, tests the frontend, tests the repository scripts and posts
   coverage; `package-build` also tests the observability stack, the backup, the apt and dnf repository scripts and the site
   page (which `check` already tests: `frontend-tests/*.cjs` includes `site.test.cjs`).
5. **`android.yml` is outside the gate**: `ci` does not wait for it, so a broken Android build can merge.
6. **Every pull request saves Rust caches**, so the 10 GB repository cache is churned by branches and `main`'s caches are
   evicted.
7. **`merge_group` triggers with no merge queue**: the ruleset has none, so those paths are dead code.
8. **Only one filter** (documentation or not): a change to `pages/` or to one packaging script runs the 20-minute browser
   suite.
9. Several jobs have no `timeout-minutes`, so a hang costs 6 hours of runner.

## Inventory: every task, today and after

| Task | Today | After |
|---|---|---|
| No build leftover tracked, auto-update script test, `Cargo.lock` up to date | `check` | `lint` |
| `cargo fmt --check`, `cargo clippy --all-targets -D warnings` | `check` | `lint` |
| Repository script tests (`node --test frontend-tests/*.cjs`, includes the site page) | `check` (+ site again in `package-build`) | `lint` (once) |
| apt and dnf repository script tests (Docker) | `package-build` amd64 | `lint` |
| Workflow lint | — | `lint` (`actionlint`, new) |
| Frontend: `npm run check`, `lint`, `test`, `build`, `static/` committed | `check` | `web` |
| Rust tests with coverage, summary, sticky comment, `coverage` artifact | `check` | `rust-test` |
| Doctests, cost of saving tables (`table_save_cost`) | `check` | `rust-doc` |
| Release binary + `static/`, amd64 and arm64 | inside `package-build`, `release`, `release-arm64` | `build` (matrix, once per arch) |
| Browser suite (20 projects) | `browser` | `browser` matrix (10 shards) + `browser-report` |
| Debian package: build, check, glibc ≤ 2.41, lintian, install on Debian stable, testing (soft) | `package-build` | `package` matrix |
| RPM: build, check, install on Fedora 42 | `package-build` | `package` matrix |
| Container image: build, run against MariaDB | `package-build` | `stack` (amd64) and `package` arm64 leg |
| Backup and restore; observability stack | `package-build` amd64 | `stack` |
| Arch package from source | `arch` | `arch` |
| Gentoo ebuild | `gentoo` (filtered) | `gentoo` (same filter) |
| Android debug app and unsigned bundle | `android.yml` (outside the gate) | `android` (filtered, inside the gate) |
| PR title is a Conventional Commit | `pr-title.yml` | unchanged |
| One required check | `ci` | `ci` |
| Next version, GitHub release (tarball, amd64 `.deb`, amd64 `.rpm`) | `release` | `release.yml`: `publish` |
| arm64 `.deb` and `.rpm` on the release | `release-arm64` | `publish` (same release, at once) |
| Container images per arch, pushed after a test, then the multi-arch manifest | `container`, `release-arm64`, `container-manifest` | `container` matrix, `container-manifest` |
| Gentoo overlay asset | `gentoo-overlay` | `gentoo-overlay` |
| Signed Android bundle asset | `android-release` | `android-release` |
| apt + dnf repository on Pages | `apt-repo` | `apt-repo` |

Nothing is dropped. The site test runs once instead of twice; the server is compiled in release mode once per
architecture.

## Design

### Files

```
.github/
  actions/
    setup-rust/action.yml     rustup ≥ 1.28 check, toolchain of rust-toolchain.toml, extra components, rust-cache
    setup-web/action.yml      actions/setup-node from .node-version, npm cache, npm ci in crates/beelot-server/web
    stop-run/action.yml       the fail-fast cancel of the run (pull requests only)
  workflows/
    ci.yml                    pull_request + push to main: every check, the `ci` gate, then calls release.yml on main
    release.yml               on: workflow_call — publishing, from the artifacts of the calling run
    pr-title.yml              unchanged, without merge_group
.node-version                 22 (Renovate's nodenv manager keeps it current)
```

`build.yml` and `android.yml` are deleted. The workflow file is renamed to `ci.yml`, the name of what it is; the check
contexts are job names, so the ruleset is not affected.

### Triggers and concurrency

- `ci.yml` runs on `pull_request` and on `push` to `main`. `merge_group` is dropped (no merge queue). If one is ever turned
  on, it is added back in one line.
- A pull request: `cancel-in-progress: true` per PR number, as today.
- `main`: **one run at a time** — `group: ci-main`, `cancel-in-progress: false`. Because the release version is now computed
  at the start of the run (it is compiled into the binary), two `main` runs must not overlap. GitHub keeps one pending run
  per group: when three merges land while a run is going, the middle one is superseded. Its commit is still checked and
  released by the next run (the version comes from every commit since the last tag, the notes from `--generate-notes`), so
  only a version number is skipped. `publish` recomputes the version under its `release` concurrency group and fails if it
  differs from the one the binaries were built with — a guard that should never fire.

### What runs: path filters

`changes` computes flags from the diff against the base (pull request) or `before` (push). On `main`, every flag is true
whenever any non-documentation file changed: a release always rests on the full set.

| Flag | True when the diff touches |
|---|---|
| `code` | anything but `docs/**` and `*.md` (today's rule) |
| `rust` | `crates/**` outside `web/` and `static/`, `Cargo.*`, `rust-toolchain.toml`, `fixtures/**` |
| `web` | `crates/beelot-server/web/**`, `crates/beelot-server/static/**` |
| `pkg` | `packaging/**`, `.github/scripts/**`, `compose.yaml`, container files |
| `android` | `android/**` |
| `gentoo` | today's rule |
| `ci` | `.github/workflows/**`, `.github/actions/**` — sets every other flag |

| Job | Runs when |
|---|---|
| `lint` | `code` |
| `web` | `web` |
| `rust-test`, `rust-doc` | `rust` or `web` (server tests read `static/`) |
| `build`, `package`, `stack` | `rust` or `web` or `pkg` |
| `browser` | `rust` or `web` |
| `arch` | `rust` or `pkg` |
| `gentoo`, `android` | their flag |

A skipped job counts as passed in the `ci` gate, as today.

### The job graph

```
changes ─┬─ lint ─────────────────────────────────────────────┐
         ├─ web ──────────────────────────────────────────────┤
         ├─ rust-test ────────────────────────────────────────┤
         ├─ rust-doc ─────────────────────────────────────────┤
         ├─ build [amd64, arm64] ─┬─ browser [10 shards] ─ browser-report
         │                        ├─ package [amd64, arm64] ──┤
         │                        └─ stack (amd64) ───────────┤
         ├─ arch ─────────────────────────────────────────────┤
         ├─ gentoo ───────────────────────────────────────────┤
         └─ android ──────────────────────────────────────────┴─ ci ── release (main only, calls release.yml)
```

Expected wall clock of a pull request touching Rust: `build` ≈ 3 min, then the browser shards ≈ 5 min, total ≈ 8–9 min.
`rust-test` (≈ 6 min, ≈ 4 if the shared database below pays off) and `arch` (≈ 6 min) run beside it.

### Composite actions

- **`setup-rust`** (inputs: `components`, `cache-key`): the rustup version check, `rustup toolchain install --profile
  minimal`, the extra components, and `Swatinem/rust-cache` with `shared-key: <cache-key>` and `save-if: github.ref ==
  'refs/heads/main'`. Pull requests restore `main`'s caches and never save their own, which ends the churn.
- **`setup-web`**: `actions/setup-node` with `node-version-file: .node-version` and `cache: npm`, then `npm ci`. Replaces the
  tool-cache lookup.
- **`stop-run`**: today's fail-fast step, with its `if: failure() && github.event_name != 'push'`. Each check job ends with
  `- uses: ./.github/actions/stop-run` and keeps `actions: write`.

All third-party actions stay pinned to a full SHA with the version as a comment.

### `lint` (≈ 2 min)

fmt, clippy, lock check (with its `LOCKDIFF` output unchanged: AGENTS.md documents it), leftovers, auto-update test,
`node --test crates/beelot-server/frontend-tests/*.cjs`, the apt and dnf repository script tests, and `actionlint`
(installed with `taiki-e/install-action`). Cache key `clippy`.

### `web` (≈ 1.5 min)

`setup-web`, then `npm run check`, `lint`, `test`, `build`, and the `static/` diff check, word for word as today. No Rust.

### `rust-test` and `rust-doc`

`rust-test`: `cargo llvm-cov nextest --workspace --lcov`, then the summary, the `coverage` artifact (same name, same
files) and the sticky comment, as today. The ruleset's `code_coverage` rule must keep seeing the coverage: verified on the
pull request of this change.

**The shared test database.** `tests/common/db.rs` starts one MariaDB container per test binary. Under nextest each test is
a process, so that would be one container per test. `db.rs` learns one variable: when `BEELOT_TEST_MARIADB_PORT` is set it
connects to that server on `127.0.0.1` instead of starting a container (each test still gets a fresh database, so tests stay
isolated). CI provides a `mariadb:12.3` service container (the tag `db.rs` uses, root without a password, as the testcontainers
module starts it) on the job. The compose database cannot stand in for it (random root password, and its `beelot` user
cannot create databases); locally, `docker run -d -p 3307:3306 -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:12.3` and
`BEELOT_TEST_MARIADB_PORT=3307` give the same speed-up. Without the variable, nothing changes.

If nextest with the shared database is not faster than today's `cargo llvm-cov` (measured in the plan), `rust-test` keeps
`cargo llvm-cov` and only gains the shared database.

`rust-doc`: `cargo test --workspace --doc`, then `cargo test -p beelot-server --test table_save_cost -- --nocapture`
(the cost report no longer needs llvm-cov). Cache key `test`.

### `build` [amd64, arm64]

On `ubuntu-24.04` and `ubuntu-24.04-arm` (the pinned images: glibc). `BEELOT_VERSION` is `0.0.0-ci` on a pull request and
`needs.changes.outputs.version` on `main`: `changes` already fetches the full history, so it runs `next-version.sh` there
(empty means `main` is already released and the release is skipped, as today; a matrix job's outputs are not reliable, so
the version is not computed in `build`). It runs `cargo build --release --locked -p beelot-server` and uploads `server-<arch>`:
the binary and `crates/beelot-server/static`. Cache key `release-<arch>`.

### `browser` [10 shards] and `browser-report`

Each shard downloads `server-amd64`, starts MariaDB (`docker compose up -d --wait`) and the server, installs **only its
engine** (`npx playwright install --with-deps <engine>`, browsers cached under `~/.cache/ms-playwright` keyed on the
Playwright version and the engine), and runs its part:

| Legs | Engine | Command |
|---|---|---|
| 6 | Chromium (14 projects, ≈ 970 tests) | `BEELOT_ENGINE=chromium npx playwright test --shard=i/6` |
| 3 | WebKit (4 projects, 2 workers a shard: 3 crashed its page) | `BEELOT_ENGINE=webkit npx playwright test --shard=i/3` |
| 1 | Firefox (2 projects) | `BEELOT_ENGINE=firefox npx playwright test` |

The browser tests run against the **release** binary: the server has no `debug_assertions` code, so this tests what ships
and saves the debug build.

`playwright.config.ts` gains:

- `BEELOT_ENGINE`: when set, only the projects of that engine (`device.engine ?? "chromium"`). `matrix.spec.ts`'s check
  that the projects match `DEVICES` applies the same filter.
- `workers: process.env.CI ? 3 : undefined` (the server runs on the same 4 vCPUs; the plan measures 2, 3 and 4).
- On CI the `blob` reporter beside `list`. Each shard uploads `blob-<engine>-<i>` (always) and its `server.log` (on
  failure).

`browser-report` (`if: always()` when any shard ran) merges the blobs with `npx playwright merge-reports --reporter html`
and uploads one `browser-report` artifact. The `browser` matrix is in the `ci` gate's `needs`, which reads the matrix's
combined result.

Shard counts follow the measured times: the goal is every leg under 5 minutes. `fullyParallel` is already on, so a shard
splits tests, not files; the long solo rounds can still land together, which the plan checks.

### `package` [amd64, arm64]

Downloads `server-<arch>` into `target/release`, then: `build-deb.sh` with the new `--prebuilt` flag (skips `cargo build`,
still runs `cargo deb --no-build`), `check-deb.sh`, glibc, lintian, Debian stable install, Debian testing (amd64, soft),
RPM build/check/Fedora install. The arm64 leg also builds and runs the container image (the amd64 one is in `stack`). On
`main`, it uploads `packages-<arch>` (the `.deb`, `.rpm` and, for amd64, the tarball) for `publish`.

### `stack` (amd64)

Downloads `server-amd64`, builds the image with `stage-container.sh`, then `test-container.sh`, `test-backup.sh` and
`test-observability.sh` — the 4-minute step no longer delays the packages.

### `arch`, `gentoo`, `android`

`arch` and `gentoo` as today, with timeouts. `android` replaces `android.yml`: one `setup-java` (Temurin 25) with `cache:
gradle`, `assembleDebug`, unsigned `bundleRelease`. It is in the `ci` gate.

### The `ci` gate

As today: `needs` every check job, `if: always()`, fails on any `failure` or `cancelled`. The `package` wrapper job is
removed: the gate reads the result of a matrix job directly, and the gate is the only required check, so the reason the
wrapper existed (a matrix's check names change) is gone.

### `release.yml` (main only)

`ci.yml`'s `release` job: `needs: [changes, ci]`, `if: github.event_name == 'push' && needs.ci.result == 'success' &&
needs.changes.outputs.version != ''`, `uses: ./.github/workflows/release.yml` with `version` as input and `secrets:
inherit`; it grants `contents: write`, `packages: write`, `pages: write`, `id-token: write`. Inside, the jobs download
artifacts of the same run:

- `publish` (`concurrency: release`): the version guard, then `gh release create v$VERSION` with the tarball and **both**
  architectures' `.deb` and `.rpm` at once.
- `container` [amd64, arm64] (needs `publish`): builds the image from `server-<arch>` (the tested binary; staging and
  `docker build` take seconds, so no image is carried between jobs), runs `test-container.sh`, pushes `:$VERSION-<arch>`.
- `container-manifest` (needs `container`, `if: !cancelled()`): `<version>` and `latest`. A matrix has one result for
  all its legs, so it asks the registry which tags were pushed: amd64 is required, arm64 is added when it is there, as
  today.
- `gentoo-overlay`, `android-release` (need `publish`): as today.
- `apt-repo` (needs `publish`, `concurrency: apt-repo`, environment `github-pages`): as today.

**Behaviour changes on `main`, on purpose:**

1. A release now needs the whole `ci` gate (browser, arch, android included), not just `check` and `package`.
2. The arm64 packages are built before the release, so a failing arm64 build blocks the release instead of leaving it
   without arm64 assets. It already blocks every pull request, so `main` cannot be in that state except by a flake.
3. The release is ≈ 10 minutes sooner: nothing is compiled after the checks.

### Tests of the workflows

The `frontend-tests` that read `build.yml` (`ci-gate`, `container-multiarch`, `gentoo-overlay`, `js-lint`,
`repo-hygiene`) are rewritten against `ci.yml`, `release.yml` and the composite actions, keeping each test's intent: the
gate's rule, fail-fast on every check job and never in the release, the amd64/arm64 tags and the manifest, the overlay job,
lint before build, the leftovers script. `actionlint` checks syntax, expressions and `needs` references.

## Out of scope

- An arm64 tarball on the release (one `tar` in `package`, but a new asset is a product decision).
- Running the Android app in an emulator.
- Changing the device list or the tests themselves.
- The Gentoo job's duration.

## Risks

- **Shard imbalance**: the long solo rounds (four Chromium sizes and some engine entries) take minutes each. Measured in
  the plan; if one leg is far longer, the solo round gets its own leg (`--grep`) instead of more shards.
- **Rate limits** of the server: unchanged, each shard has its own server and database.
- **Artifact transfer**: the server binary is ≈ tens of MB; download takes seconds. Artifacts are kept 1 day
  (`retention-days: 1`) except reports (7) and coverage (as today).
- **The first `main` run** is the first real test of `release.yml`. The plan's last task watches it; a revert of the PR
  brings back `build.yml` if it fails.
