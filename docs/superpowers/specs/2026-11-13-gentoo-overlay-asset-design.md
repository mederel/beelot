# The Gentoo overlay as a release asset (US-143)

## Design

- `build-gentoo-overlay.sh VERSION OUTDIR` runs as root in `gentoo/stage3`: it syncs Portage (the Manifest needs the
  eclasses), installs `dev-lang/rust-bin` (for `cargo metadata`), declares both repositories in `repos.conf`, then runs
  `prepare-ebuild.sh` without a local tarball, so `ebuild manifest` downloads the tag's own tarball and the crates and
  hashes them. It checks the Manifest lists the source tarball, the ebuild exists and has no placeholder, and packs the
  overlay as `beelot-gentoo-overlay-VERSION.tar.gz`.
- The `gentoo-overlay` job of `build.yml` needs `release`, runs only for a release on `main`, runs the script in the
  container on the checkout of the released commit, and `gh release upload`s the tarball. Like the arm64 job, its failure
  does not unpublish the release.
- The README installs from the asset: remove the overlay directory, extract the tarball into it. The overlay holds one
  release's ebuild, and the Manifest lists only its files, so it is replaced, not extended.

## Not verified here

The job only runs for a release; it was not run. It reuses the pieces the pull-request `gentoo` job already tries
(`prepare-ebuild.sh`, the `repos.conf` setup), apart from the download of the tag's tarball and the upload.
