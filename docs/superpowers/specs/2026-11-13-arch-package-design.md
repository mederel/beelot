# An Arch Linux package (US-136)

- **PKGBUILD** (`packaging/arch/`): builds the tagged release from source (`cargo fetch --locked`, then
  `cargo build --frozen --release -p beelot-server`, with `BEELOT_VERSION` set so the app shows its version), and
  installs the server, the frontend, the Debian package's unit and settings file (one source of truth), a `sysusers.d`
  file for the user and a `tmpfiles.d` file for the settings file's `root:beelot` 0640 (the group does not exist while
  packaging, and pacman's hooks create users and apply tmpfiles at install). `backup=(etc/beelot/beelot.env)` keeps
  edits. The unit is not enabled; `mariadb` is only an `optdepends`.
- **Template:** the committed PKGBUILD is a template (`pkgver=0.0.0`, `SKIP` checksums). `prepare-pkgbuild.sh VERSION
  OUTDIR [TARBALL]` fills in the version and real checksums, downloading the tag's tarball or using a local one. CI
  uses `git archive` of the pull request's tree, so the packaging is tried before any tag exists.
- **CI:** a separate `arch` job (it compiles Rust from scratch, so it runs beside `package`, not inside it) runs
  `test-arch-package.sh` in `archlinux:latest`: builds as a non-root user, installs with `pacman -U`, checks the user and
  group, owner and mode of the settings file and its directory, that it is a backup file, the libraries, the unit, that
  nothing is enabled, and that removal keeps the user.
- **AUR:** not published. The README tells a maintainer how (`prepare-pkgbuild.sh`, `.SRCINFO`).
- **License:** `AGPL-3.0-or-later` is one of Arch's common licenses, so no licence file is installed.

## Not verified
Nothing was built where it was written (no Arch, Docker or network). Expect to fix on the first run: the container's
`cargo` version against the 2024 edition, `su` and quoting in the test script, and the `systemd-analyze` check in a
container. This story builds on the RPM branch (US-133) for the backlog text, so it is a stacked pull request.
