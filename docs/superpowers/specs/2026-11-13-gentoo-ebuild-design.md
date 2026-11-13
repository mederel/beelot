# A Gentoo ebuild (US-138)

## Goal

A Gentoo user installs Beelot with `emerge`, built with their own flags, run by systemd or OpenRC.

## Design

- `packaging/gentoo/` is the overlay: `metadata/layout.conf`, `profiles/repo_name`, `games-board/beelot/` (with
  `metadata.xml`, the init script in `files/` and the ebuild template), and `acct-user/beelot` and `acct-group/beelot`.
- The ebuild lists every crate of `Cargo.lock` in `CRATES` and their licences in `LICENSE`, so it changes with each
  release. It is therefore generated: `.github/scripts/prepare-ebuild.sh VERSION OUTDIR` fills the template from
  `Cargo.lock` (the crates) and `cargo metadata` (the licences, mapped to Gentoo's names by
  `gentoo-ebuild-data.py`, which fails on a crate outside the registry or a licence it cannot name), then makes the
  Manifest with `ebuild manifest` when Portage is present. Neither pycargoebuild nor a committed `Manifest` is used: a
  Manifest is per version and needs the crates downloaded, so the overlay with it is the script's output, as the Arch
  `PKGBUILD` is. The README says how to generate it, and that publishing it to GURU or `::gentoo` is left to a maintainer.
- It installs what the other packages do: the server, the frontend, the Debian unit and settings file. The settings file
  is `root:beelot` 0640 in a 0750 directory, set with `fowners`/`fperms` (the ebuild depends on `acct-user/beelot` at
  build time for that), and `/etc` is in `CONFIG_PROTECT`, so edits survive updates.
- OpenRC: a `supervise-daemon` script run as `beelot`, which sources `/etc/beelot/beelot.env` in `start_pre`. Nothing is
  started or enabled; `pkg_postinst` says how.
- `mariadb` USE flag (default on) adds a runtime dependency on `dev-db/mariadb`; nothing else requires a database.
- CI: a `gentoo` job in a `gentoo/stage3` container runs `test-gentoo-ebuild.sh`: sync Portage, install `rust-bin` and
  `pkgcheck`, generate the overlay from the working tree, `pkgcheck scan --exit error`, the ebuild's install phases (which
  compile), checks on the image, a merge, the user and group, no enablement, and removal. The job runs only when
  `packaging/gentoo/`, the three scripts or `Cargo.lock` change (the `changes` job's `gentoo` output).

## Not verified here

None of it could be run here (no Gentoo, no Rust toolchain, no network for crates): the first CI run is the real test,
and `cargo_target_dir`, the `pkgcheck` findings and the licence names may need a correction. Out of scope: a live
ebuild, binary packages, arm64.
