# An RPM package (US-133)

- **Spec:** `packaging/rpm/beelot.spec` packs what the release build already made (`target/release/beelot-server`, the
  frontend, the Debian package's unit and settings file, so the two packages cannot drift). `%beelot_version` and
  `%beelot_root` are passed on the command line; there is no source tarball and no compile step.
- **Convention, not Debian's:** the install does not enable or start the service (Fedora's packaging guidelines),
  `%systemd_post/preun/postun_with_restart` handle the unit, and an upgrade restarts a running service. The settings
  file is `%config(noreplace)`, `root:beelot` 0640 in a 0750 directory. The `beelot` user comes from a `%pre`
  scriptlet (`useradd --system`). `Recommends: mariadb-server`, never `Requires`.
- **glibc:** the binary is built on Ubuntu 24.04 (glibc 2.39). RPM's automatic dependencies make the package require
  `libc.so.6(GLIBC_2.39)`, so `dnf` refuses it on RHEL 9 and clones. The check script asserts that a glibc requirement
  exists. Supporting them needs a build in an EL9 container, a separate story.
- **Scripts** (run in a `fedora:42` container, like the Debian ones in `debian:trixie`): `build-rpm.sh VERSION` (version
  must be `x.y.z`; the CI build uses `0.0.0`), `check-rpm.sh` (metadata, requires, modes and owners, `%config`
  flags, scriptlets, unit and settings content), `test-rpm-install.sh` (install, user, mode, unit verify, not enabled,
  edited settings survive a reinstall, removal keeps the user).
- **CI:** the `package` job runs the three on every pull request; the `release` job builds and checks the RPM for the
  release version and attaches it to the GitHub release next to the `.deb` and the tarball.
- **License tag:** `AGPL-3.0-or-later`, as in the crates.

## Not verified
Nothing here was built or installed where it was written (no `rpmbuild`, no Docker, no network). Likely first-run
failures to expect: the `Recommends`/`%systemd_requires` macros on Fedora 42, the `rpm -qlvp` column parsing in
`check-rpm.sh`, and `systemd-analyze verify` in a container. The pull request's CI is the first real run.
