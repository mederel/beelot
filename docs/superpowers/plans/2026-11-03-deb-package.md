# Debian package and apt repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every release builds a `.deb` of the server and publishes it to a signed apt repository on GitHub Pages, so `apt install beelot` and `apt upgrade` work on Debian and Ubuntu.

**Architecture:** `cargo-deb` builds the package from `packaging/debian/` and metadata in the server's `Cargo.toml`. A shell script (`build-apt-repo.sh`) turns a directory of `.deb` files into a signed apt tree; the workflow deploys that tree to GitHub Pages after each release. Pull requests build and check the package and the repository script with a throwaway key; they never sign or deploy.

**Tech Stack:** cargo-deb, dpkg-dev / apt-utils (`dpkg-scanpackages`, `apt-ftparchive`), gpg, lintian, GitHub Actions (Pages), Docker (local checks only), bash.

**Spec:** `docs/superpowers/specs/2026-11-03-deb-package-design.md`

**Local environment:** the developer machine has Docker but no dpkg tooling, so every Debian-side check runs in a container, for example
`docker run --rm -v "$PWD":/w -w /w debian:trixie bash -c 'apt-get update -qq && apt-get install -y -qq dpkg-dev apt-utils gnupg lintian >/dev/null && <command>'`.
Build the binary for those checks in `rust:1.95-trixie` (same glibc as the install target), not on the host: the host's glibc is newer than Debian 13's.

## Global Constraints

- Package name `beelot`, architecture `amd64`, version = `.github/scripts/next-version.sh` output (the tag without `v`), passed to `cargo deb --deb-version`.
- Files: `/usr/bin/beelot-server`; `/usr/share/beelot/static/` (from `crates/beelot-server/static/`); `/lib/systemd/system/beelot.service`; `/etc/beelot/beelot.env` (a conffile, mode 0640, `root:beelot` after install); `/usr/share/doc/beelot/README.md`.
- `Recommends: mariadb-server`; never `Depends` on it; the package never touches the database.
- The service runs as user and group `beelot`, `EnvironmentFile=/etc/beelot/beelot.env`, `Restart=on-failure`, `After=network-online.target mariadb.service` with `Wants=network-online.target` (no hard dependency on MariaDB).
- `beelot.env` defaults: `BEELOT_BIND=127.0.0.1:8080`, `BEELOT_STATIC_DIR=/usr/share/beelot/static`; every other variable of the README's configuration table is present, commented out, with its default.
- `postinst` creates the system user, fixes the env file's owner and mode, enables the unit and does **not** start it on a fresh install; an upgrade restarts a running service. `postrm purge` removes `/etc/beelot`, never the user or a database.
- Repository layout under the Pages root: `beelot.asc`, `dists/stable/{Release,InRelease,Release.gpg}`, `dists/stable/main/binary-amd64/Packages(.gz)`, `pool/main/b/beelot/beelot_<version>_amd64.deb`. Suite and codename `stable`, component `main`.
- Secrets `APT_GPG_PRIVATE_KEY` and `APT_GPG_PASSPHRASE`; signing in a throwaway `GNUPGHOME` removed at the end of the job. Pages deploy permissions `pages: write`, `id-token: write`, environment `github-pages`.
- Every GitHub Action is pinned by commit SHA with its version in a comment, like the existing ones. Pull requests never receive secrets and never deploy.
- Documentation-only pushes release nothing, so they publish no package (unchanged).
- Conventional Commits for every commit; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An upgrade must not clobber `/etc/beelot/beelot.env`** (the player's database password), and a fresh install must not start a service whose database does not exist yet. Pinned in Task 1 (conffile and maintainer-script checks).
- **The env file must not be world-readable** (it holds the database password): mode 0640, group `beelot`. Pinned in Task 1.
- **A release with no earlier `.deb` (the first one) and a release after many** must both produce a valid repository, with every version listed and the newest chosen by `apt`. Pinned in Task 2 (two versions, then one).
- **A missing or wrong signing secret must fail the `apt-repo` job visibly** and leave the GitHub release (tarball and `.deb`) published; a pull request or fork must never reach the signing step. Pinned in Task 3 (job conditions, `set -u` on the secrets).
- **The private key must not leak** into logs, artifacts or the Pages tree; `beelot.asc` is the public key only. Pinned in Task 2 (the test asserts the output tree holds no private key) and Task 3 (`GNUPGHOME` removed, `if: always()`).

---

### Task 1: The package

**Files:**
- Create: `packaging/debian/beelot.service`, `packaging/debian/beelot.env`, `packaging/debian/postinst`, `packaging/debian/postrm`
- Create: `.github/scripts/build-deb.sh`, `.github/scripts/check-deb.sh`
- Modify: `crates/beelot-server/Cargo.toml` (add `[package.metadata.deb]`)

**Interfaces:**
- Produces: `.github/scripts/build-deb.sh VERSION` builds the release binary and writes `dist/beelot_VERSION_amd64.deb`. `.github/scripts/check-deb.sh DEB VERSION` exits non-zero with a message naming the first failed assertion. Tasks 2 and 3 call both.

- [ ] **Step 1: Write the failing check**

`.github/scripts/check-deb.sh DEB VERSION` (bash, `set -euo pipefail`; needs `dpkg-deb`). It asserts, each with a clear failure message:
  - `dpkg-deb -f DEB Package` is `beelot`, `Version` is `VERSION`, `Architecture` is `amd64`, `Recommends` contains `mariadb-server` and `Depends` does not.
  - `dpkg-deb -c DEB` lists `./usr/bin/beelot-server` (mode `-rwxr-xr-x`), `./usr/share/beelot/static/index.html`, `./lib/systemd/system/beelot.service`, `./etc/beelot/beelot.env` (mode `-rw-r-----`) and `./usr/share/doc/beelot/README.md`.
  - `dpkg-deb -I DEB conffiles` lists `/etc/beelot/beelot.env`.
  - the control archive holds `postinst` and `postrm`, both executable, with no literal `#DEBHELPER#` left (cargo-deb replaced it), `postinst` creating the user (`adduser`) and containing the unit's enable autoscript but no start of the unit on a fresh install (no `deb-systemd-invoke start`; a `restart` under the upgrade case is expected).
  - the extracted unit contains `User=beelot`, `EnvironmentFile=/etc/beelot/beelot.env`, `Restart=on-failure`, `Wants=network-online.target`, and does not contain `Requires=mariadb`.
  - the extracted env file contains `BEELOT_BIND=127.0.0.1:8080` and `BEELOT_STATIC_DIR=/usr/share/beelot/static` uncommented, and one commented line `#NAME=default` for each other variable of the README table (`BEELOT_DATABASE_URL`, `BEELOT_DATABASE_USERNAME`, `BEELOT_DATABASE_PASSWORD`, `BEELOT_PUBLIC_URL`, `BEELOT_TRUST_FORWARDED_HEADERS`, `BEELOT_PRIVACY_CONTROLLER`, `BEELOT_PRIVACY_CONTACT`, `BEELOT_HOSTING_PROVIDER`, `BEELOT_BACKUP_RETENTION_DAYS`).

- [ ] **Step 2: Run it to see it fail**

Run: `.github/scripts/check-deb.sh dist/beelot_9.9.9_amd64.deb 9.9.9` inside the Debian container.
Expected: FAIL, "no such file" for the `.deb`.

- [ ] **Step 3: Write the package sources**

- `packaging/debian/beelot.service`: the unit described in Global Constraints, with `ExecStart=/usr/bin/beelot-server`, `User=beelot`, `Group=beelot`, and `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `PrivateDevices=yes`, `ProtectKernelTunables=yes`, `ProtectControlGroups=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`; `[Install] WantedBy=multi-user.target`.
- `packaging/debian/beelot.env`: a header comment saying what the file is and that the service must be restarted after an edit, then the variables from Global Constraints.
- `packaging/debian/postinst` (`/bin/sh`, `set -e`): on `configure`, create the system group and user `beelot` when missing (`adduser --system --group --no-create-home --home /nonexistent beelot`), `chown root:beelot /etc/beelot/beelot.env`, `chmod 0640` it; ends with `#DEBHELPER#`.
- `packaging/debian/postrm`: on `purge`, `rm -rf /etc/beelot`; ends with `#DEBHELPER#`.
- `crates/beelot-server/Cargo.toml` `[package.metadata.deb]`: `name = "beelot"`, `maintainer`, `copyright`, `section = "games"`, `priority = "optional"`, `extended-description`, `depends = "$auto"`, `recommends = "mariadb-server"`, `maintainer-scripts = "../../packaging/debian"`, `conf-files = ["/etc/beelot/beelot.env"]`, `systemd-units = { unit-scripts = "../../packaging/debian", enable = true, start = false, restart-after-upgrade = true }`, and `assets` for the five paths of Global Constraints (binary `target/release/beelot-server`, the `static/` tree, the unit, the env file with mode `0640`, the README from the repository root with mode `0644`).
- `.github/scripts/build-deb.sh VERSION`: `cargo build --release --locked -p beelot-server`, then `cargo deb -p beelot-server --no-build --deb-version "$VERSION" -o "dist/beelot_${VERSION}_amd64.deb"`; creates `dist/`.

- [ ] **Step 4: Build and check**

Run, in `rust:1.95-trixie` with `cargo install cargo-deb --locked` first: `.github/scripts/build-deb.sh 9.9.9`, then `.github/scripts/check-deb.sh dist/beelot_9.9.9_amd64.deb 9.9.9` (the check needs `dpkg-deb`, present in that image).
Expected: build succeeds, check prints `ok` and exits 0. If `cargo deb` warns that `dpkg-shlibdeps` is missing, install `dpkg-dev` in the container.

- [ ] **Step 5: Install it in a clean Debian**

In `debian:trixie`: `dpkg -i dist/beelot_9.9.9_amd64.deb || apt-get -f install -y`, then assert `getent passwd beelot`, `stat -c '%a %U:%G' /etc/beelot/beelot.env` is `640 root:beelot`, `ldd /usr/bin/beelot-server` has no `not found`, `systemd-analyze verify /lib/systemd/system/beelot.service` has no error (install `systemd` first), and `systemctl is-enabled` is not asserted (no systemd running in the container). Edit `/etc/beelot/beelot.env`, reinstall the same package with `dpkg -i`, and assert the edit survived.
Expected: all assertions hold; the edit survives the reinstall.

- [ ] **Step 6: Commit**

```bash
git add packaging .github/scripts/build-deb.sh .github/scripts/check-deb.sh crates/beelot-server/Cargo.toml
git commit -m "feat: build a Debian package of the server"
```

### Task 2: The apt repository script

**Files:**
- Create: `.github/scripts/build-apt-repo.sh`, `.github/scripts/test-apt-repo.sh`

**Interfaces:**
- Consumes: any directory of `beelot_*_amd64.deb` files.
- Produces: `.github/scripts/build-apt-repo.sh DEBS_DIR OUT_DIR KEY_ID` builds the tree of Global Constraints in `OUT_DIR`, signing with the key `KEY_ID` already present in the current `GNUPGHOME` (passphrase handled by the caller: the workflow primes `gpg-agent`/uses `--pinentry-mode loopback` through the `APT_GPG_PASSPHRASE` environment variable when set). Task 3 calls it.

- [ ] **Step 1: Write the failing test**

`.github/scripts/test-apt-repo.sh` (bash, run as root in a Debian container with `dpkg-dev apt-utils gnupg`). It:
  - makes a throwaway `GNUPGHOME` and a passphrase-less key (`gpg --batch --quick-generate-key 'Beelot test <test@example.invalid>' rsa3072 sign never`);
  - builds two stub packages with `dpkg-deb --build` from a minimal tree (`Package: beelot`, versions `1.0.0` and `1.1.0`, `Architecture: amd64`, a file `/usr/share/beelot/version` holding the version);
  - runs `build-apt-repo.sh` twice: once with only the `1.0.0` package (the first release), once with both;
  - asserts, for the final tree: the layout paths of Global Constraints exist; `Packages` lists both versions; `Release` states `Suite: stable`, `Codename: stable`, `Architectures: amd64`, `Components: main` and carries the `SHA256` of `Packages`; `gpg --verify` of `InRelease` and of `Release.gpg` succeeds against `beelot.asc` imported into an empty keyring; `beelot.asc` holds no private key (`gpg --show-keys` lists `pub` and no `sec`) and no file of the tree contains `PRIVATE KEY`;
  - writes a deb822 source with `Signed-By: <path to beelot.asc>` pointing at `file:///<out>`, runs `apt-get update`, `apt-get install -y beelot`, and asserts `/usr/share/beelot/version` reads `1.1.0` (the newest wins), then `apt-get install -y beelot=1.0.0 --allow-downgrades` reads `1.0.0` (an older version stays installable);
  - tampers with `Packages` and asserts `apt-get update` then fails (the signature protects the index).

- [ ] **Step 2: Run it to see it fail**

Run in `debian:trixie` (install `dpkg-dev apt-utils gnupg`): `.github/scripts/test-apt-repo.sh`.
Expected: FAIL, `build-apt-repo.sh: No such file`.

- [ ] **Step 3: Implement `build-apt-repo.sh`**

Bash, `set -euo pipefail`, three required arguments (usage message otherwise), no secrets echoed (`set +x`). It copies the `.deb` files into `OUT_DIR/pool/main/b/beelot/`, runs `dpkg-scanpackages --arch amd64 pool/main /dev/null` from `OUT_DIR` into `dists/stable/main/binary-amd64/Packages` (and `gzip -9k` of it), writes `Release` with `apt-ftparchive` and `-o APT::FTPArchive::Release::{Origin,Label,Suite,Codename,Architectures,Components}` set to `Beelot`, `Beelot`, `stable`, `stable`, `amd64`, `main`, then signs: `gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0` fed from `APT_GPG_PASSPHRASE` when it is set (else no passphrase), `--default-key KEY_ID`, `--clearsign` to `InRelease` and `--armor --detach-sign` to `Release.gpg`; exports `gpg --armor --export KEY_ID` to `beelot.asc`.

- [ ] **Step 4: Run the test to see it pass**

Run: the same command as step 2.
Expected: every assertion passes and the script prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/build-apt-repo.sh .github/scripts/test-apt-repo.sh
git commit -m "feat: build a signed apt repository from the packages"
```

### Task 3: The workflow

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `build-deb.sh`, `check-deb.sh` (Task 1), `build-apt-repo.sh`, `test-apt-repo.sh` (Task 2), `next-version.sh`.
- Produces: the `release` job gains the output `version` and attaches the `.deb`; a `package` job runs on pull requests; an `apt-repo` job deploys the repository.

- [ ] **Step 1: Write the lint that must pass**

The check for this task is `actionlint` (run in Docker: `docker run --rm -v "$PWD":/r -w /r rhysd/actionlint:latest -color`) plus a YAML parse. Run it on the unchanged workflow first.
Expected: clean (baseline).

- [ ] **Step 2: Add the `package` job**

`needs: changes`, `if: needs.changes.outputs.code == 'true'`, `runs-on: ubuntu-latest`, `permissions: contents: read`. Steps: checkout, the same pinned toolchain and rust-cache as `check`, `apt-get install` of `dpkg-dev apt-utils gnupg lintian`, `cargo-deb` installed through the pinned `taiki-e/install-action` (pin a version found with `cargo search cargo-deb`), `build-deb.sh 0.0.0-ci`, `check-deb.sh dist/beelot_0.0.0-ci_amd64.deb 0.0.0-ci`, `lintian --fail-on error dist/*.deb` (warnings are printed, not blocking), then a `docker run debian:trixie` step that installs the `.deb` (`dpkg -i` then `apt-get -f install`) and repeats Task 1's step-5 assertions, and a second `docker run debian:trixie` step that runs `test-apt-repo.sh`. No secrets are used.

- [ ] **Step 3: Extend the `release` job**

Give the job `outputs: version: ${{ steps.version.outputs.version }}`. After the existing `Package` step, install `cargo-deb` (same pinned action), run `.github/scripts/build-deb.sh "$VERSION"` and `check-deb.sh`; add `dist/beelot_*.deb` to the `upload-artifact` path and to `gh release create` (with the tarball). All steps keep the `if: steps.version.outputs.version != ''` guard.

- [ ] **Step 4: Add the `apt-repo` job**

`needs: release`, `if: needs.release.outputs.version != ''`, `runs-on: ubuntu-latest`, `permissions: contents: read, pages: write, id-token: write`, `environment: name: github-pages`, `concurrency: group: apt-repo`. Steps: checkout; `apt-get install dpkg-dev apt-utils gnupg`; a step that fails with a clear `::error::` message when `APT_GPG_PRIVATE_KEY` or `APT_GPG_PASSPHRASE` is empty (secrets passed as `env:` of that step only); download every release's `.deb` with `gh release download --pattern '*.deb' --dir debs` for all tags (`gh release list --json tagName`), which includes the one just made; set `GNUPGHOME` to `mktemp -d`, import the key (`gpg --batch --import`), read its key id from `gpg --list-secret-keys --with-colons`; run `build-apt-repo.sh debs site "$KEY_ID"` with `APT_GPG_PASSPHRASE` in the env of that step only; `actions/configure-pages`, `actions/upload-pages-artifact` (path `site`), `actions/deploy-pages`; a final `if: always()` step removing `GNUPGHOME`. Resolve each new action's SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha` (follow the tag object if it is annotated) and comment its version, as the existing steps do.

- [ ] **Step 5: Lint**

Run: the `actionlint` command of step 1, and `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml'))"`.
Expected: no findings, parse succeeds. Also read the diff once for the Review Focus items: no secret outside the two steps that need it, `apt-repo` unreachable from `pull_request`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: publish the Debian package to a signed apt repository"
```

### Task 4: The README, and verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-03-deb-package-design.md` (Known limits and a Verification section)

**Interfaces:**
- Consumes: the paths, variables and secret names of Global Constraints.

- [ ] **Step 1: Write "Install from the apt repository"**

After "Serve over HTTPS" (before "Develop"): the key (`curl -fsSL https://mederel.github.io/beelot/beelot.asc | sudo tee /etc/apt/keyrings/beelot.asc >/dev/null`), the deb822 source file `/etc/apt/sources.list.d/beelot.sources` (`Types: deb`, `URIs: https://mederel.github.io/beelot`, `Suites: stable`, `Components: main`, `Architectures: amd64`, `Signed-By: /etc/apt/keyrings/beelot.asc`), `sudo apt update && sudo apt install beelot`, then creating the database and user (`CREATE DATABASE beelot; CREATE USER 'beelot'@'localhost' IDENTIFIED BY '<password>'; GRANT ALL ON beelot.* TO 'beelot'@'localhost';`), setting `BEELOT_DATABASE_PASSWORD` in `/etc/beelot/beelot.env`, `sudo systemctl start beelot`, `journalctl -u beelot`, and a pointer to "Serve over HTTPS". State the supported systems (Debian 13, Ubuntu 24.04 and later, amd64).

- [ ] **Step 2: Write "Publishing the apt repository"**

Under "Releases": the one-time setup (generate the key with `gpg --quick-generate-key`, export `gpg --armor --export-secret-keys`, add `APT_GPG_PRIVATE_KEY` and `APT_GPG_PASSPHRASE`, set Pages' source to "GitHub Actions"), what happens without it (the `apt-repo` job fails, the release still has the tarball and the `.deb`), and key rotation (new key, update the secrets, users replace `beelot.asc`).

- [ ] **Step 3: Verify the whole**

Run, in the Debian container: `build-deb.sh`, `check-deb.sh`, the install assertions of Task 1 step 5, `test-apt-repo.sh`; and on the host: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `node --test crates/beelot-server/frontend-tests/`, `actionlint`.
Expected: all pass (the Rust and Node suites are unchanged by this work).

- [ ] **Step 4: Record what verification found**

Add to the spec a "Verification" section: what ran locally (containers) and what only CI or the first real release can prove (the Pages deploy and the signing secrets), plus any limit discovered. State plainly that the deploy path is untested until the secrets exist.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-03-deb-package-design.md
git commit -m "docs: install Beelot from the apt repository"
```
