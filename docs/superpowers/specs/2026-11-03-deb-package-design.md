# Debian package and apt repository — design

## Goal

`apt install beelot` works on a Debian or Ubuntu server, and `apt upgrade` picks
up each new release. Every release builds a `.deb` of the server and publishes it
to a signed apt repository hosted by GitHub Pages. The release workflow
(`.github/workflows/build.yml`) is extended to do it; nothing is built by hand.

Today a release builds `beelot-server` and attaches
`beelot-<version>-linux-x86_64.tar.gz` (the server, `static/` and the README).
The server reads its settings from the environment (see the README), runs its own
database migrations at startup (`db::migrate`) and finds the frontend through
`BEELOT_STATIC_DIR`. It speaks plain HTTP (see "Serve over HTTPS" in the README).

## Decisions

- **GitHub Pages, signed.** Decided with the user. The repository is static files
  on `https://mederel.github.io/rubeelot`, signed with a dedicated GPG key kept as
  a repository secret. No `[trusted=yes]`: apt's integrity check stays on.
- **The package does not touch the database.** Decided with the user. It
  `Recommends: mariadb-server` and ships defaults; creating the database and its
  user is a documented step. The package therefore works with a remote or managed
  MariaDB and an upgrade never writes to the data.
- **amd64 only**, like the tarball today.
- **The `.deb` is built in the release job**, from the same `cargo build --release
  --locked -p beelot-server` as the tarball, so both hold the same binary.
- **One version.** The package version is `next-version.sh`'s output, the tag
  without its `v`.
- **The tarball stays.** The `.deb` is added to the GitHub release beside it.

## Part 1 — The package

Built by `cargo-deb`, configured under `[package.metadata.deb]` in
`crates/beelot-server/Cargo.toml`. Package name `beelot`; the version is passed on
the command line (`cargo deb --deb-version`), since the crate version is not the
release version.

| Path                              | Content                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `/usr/bin/beelot-server`          | the release binary                                          |
| `/usr/share/beelot/static/`       | the frontend (`crates/beelot-server/static/`)               |
| `/lib/systemd/system/beelot.service` | the service unit                                         |
| `/etc/beelot/beelot.env`          | the settings, a conffile: an upgrade never overwrites edits |
| `/usr/share/doc/beelot/README.md` | the README                                                  |

Sources live in `packaging/debian/` (`beelot.service`, `beelot.env`, `postinst`,
`postrm`).

- **`beelot.env`** lists every variable of the README's table, commented out with
  its default, except `BEELOT_BIND=127.0.0.1:8080` (the server stays behind a
  proxy, as the HTTPS section recommends) and `BEELOT_STATIC_DIR=/usr/share/beelot/static`.
  It is readable by the `beelot` group only (mode 0640, `root:beelot`), because it
  holds the database password.
- **`beelot.service`**: `User=beelot`, `Group=beelot`,
  `EnvironmentFile=/etc/beelot/beelot.env`, `ExecStart=/usr/bin/beelot-server`,
  `Restart=on-failure`, `After=network-online.target mariadb.service`
  (`Wants=network-online.target`, and no hard dependency on MariaDB so a remote one
  works), and sandboxing that needs nothing from the host: `NoNewPrivileges`,
  `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`,
  `ProtectKernelTunables`, `ProtectControlGroups`, `RestrictAddressFamilies=AF_INET
  AF_INET6 AF_UNIX`.
- **`postinst`** (`configure`): creates the `beelot` system user and group when
  missing (`adduser --system --group --no-create-home`), sets the env file's owner
  and mode, then `systemctl daemon-reload` and `enable` (through
  `deb-systemd-helper`, as debhelper does). It does **not** start the service: the
  database is not configured yet. An upgrade restarts a service that is already
  running.
- **`postrm`**: on `purge` removes `/etc/beelot`; it never removes the user or any
  database.
- **Dependencies**: `${shlibs:Depends}` computed by `cargo-deb`; `Recommends:
  mariadb-server`.
- **Metadata**: maintainer, homepage (`https://github.com/mederel/rubeelot`),
  section `games`, a short description.

## Part 2 — The apt repository

A flat structure under the Pages root:

```
beelot.asc                      the public signing key
dists/stable/Release            signed (InRelease, Release.gpg)
dists/stable/main/binary-amd64/Packages(.gz)
pool/main/b/beelot/beelot_<version>_amd64.deb
```

- **Index**: generated with `dpkg-scanpackages` and `apt-ftparchive release`
  (package `dpkg-dev` and `apt-utils`, on the runner), with a script
  `.github/scripts/build-apt-repo.sh` that takes the directory of `.deb` files and
  the output directory. Pure shell, testable locally without the secrets.
- **History**: the repository lists every release. The job downloads the `.deb`
  of earlier releases from the GitHub releases (`gh release download --pattern
  '*.deb'`), so an older version stays installable and `apt install beelot=<v>`
  works. The files are served from Pages, not linked to the releases.
- **Signing**: `gpg` with the key imported from `APT_GPG_PRIVATE_KEY`, unlocked by
  `APT_GPG_PASSPHRASE`, in a throwaway `GNUPGHOME` that is removed at the end of
  the job. Produces `InRelease` (clear-signed) and `Release.gpg` (detached). The
  public key is exported as `beelot.asc` (armored).
- **Deploy**: `actions/upload-pages-artifact` then `actions/deploy-pages` in a
  separate `apt-repo` job with the `github-pages` environment and
  `permissions: pages: write, id-token: write`.

### Workflow changes (`build.yml`)

- The `release` job also runs `cargo install cargo-deb --locked` (or the pinned
  `taiki-e/install-action`, like `cargo-llvm-cov`), builds the `.deb`, uploads it
  with the tarball as a workflow artifact and attaches it to the GitHub release.
  The release job exposes the version as an output.
- A new `apt-repo` job `needs: release`, runs only when the release produced a
  version, in a `concurrency: group: apt-repo` (the repository is rebuilt from
  every release, so two runs must not overlap).
- Every action is pinned by SHA, like the existing ones. A pull request builds the
  package and checks it (below) but never signs or deploys.
- The documentation-only skip is unchanged: no release, so no new package.

### Checks on every pull request

A `package` job (needs `changes`, runs when code changed) builds the `.deb` and:

- `dpkg-deb --info` and `--contents` for the expected files and modes;
- `lintian` with no `error`-level tag (warnings are reported, not blocking);
- installs it in a `debian:trixie` container (`dpkg -i`, with `apt-get -f` to
  resolve dependencies) and checks that the `beelot` user and
  `/etc/beelot/beelot.env` exist, that `ldd /usr/bin/beelot-server` reports no
  missing library on Debian 13, and that the unit passes `systemd-analyze verify`
  (a full start needs MariaDB, so it is not attempted).

`build-apt-repo.sh` is exercised in the same job with a throwaway key generated on
the fly, and the resulting repository is installed from a `file:` source in the
container, so the index, the signature and `apt install beelot` are tested for real
without the repository secrets.

## Part 3 — README

A new section "Install from the apt repository" (near "Release build"):

1. Add the key: `curl -fsSL https://mederel.github.io/rubeelot/beelot.asc | sudo
   tee /etc/apt/keyrings/beelot.asc`.
2. Add the source (a `beelot.sources` deb822 file with `Signed-By`).
3. `sudo apt update && sudo apt install beelot`.
4. Create the database and user (the two SQL statements), edit
   `/etc/beelot/beelot.env`, then `sudo systemctl start beelot`; where the logs are
   (`journalctl -u beelot`).
5. Pointer to "Serve over HTTPS" for the proxy.

And a maintainer section "Publishing the apt repository (one time)": generate the
key (`gpg --quick-generate-key`, no expiry or a long one, export the armored
private key), add the secrets `APT_GPG_PRIVATE_KEY` and `APT_GPG_PASSPHRASE`, and
set Pages' source to "GitHub Actions". The README documents how to rotate the key.

## Testing

- Shell: `build-apt-repo.sh` run in CI with a throwaway key (above); checks that
  `Packages`, `Release` and `InRelease` exist, that `gpg --verify` of `InRelease`
  passes with the exported key, and that apt resolves and installs the package.
- Package: the `package` job's `dpkg-deb`, `lintian` and container install.
- The signing secrets and the Pages deploy cannot be tested before the secrets and
  Pages exist; the first release after setup is the real test, and the workflow
  fails visibly (not silently) when a secret is missing.

## Out of scope

- Other architectures (arm64) and distributions (RPM, Alpine).
- Building in an older-glibc container: the binary is built on `ubuntu-latest`.
- Creating the MariaDB database or user from the package.
- A `systemd` timer or logrotate (journald holds the logs).
- Key rotation tooling beyond the README's instructions.

## Known limits

- The binary needs the glibc of the runner image: Debian 13 and Ubuntu 24.04 or
  later. Older releases would need a build in a container.
- The repository is a single suite `stable`; there is no separate channel for
  pre-releases.
- The first package cannot be installed until the maintainer has created the key,
  added the two secrets and enabled Pages; until then the `apt-repo` job fails and
  the GitHub release (tarball and `.deb`) is still published.
