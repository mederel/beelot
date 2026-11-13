# A dnf repository on GitHub Pages (US-134)

- **Builder:** `build-rpm-repo.sh RPMS_DIR OUT_DIR KEY_ID` copies every release's RPM to `OUT_DIR/rpm/`, runs
  `createrepo_c`, signs `repodata/repomd.xml` (detached, armored: `repomd.xml.asc`, which dnf looks for next to the
  index when `repo_gpgcheck=1`), exports the public key to `beelot.asc` (the apt repository's file, same key) and writes
  `rpm/beelot.repo`. It runs after `build-apt-repo.sh` on the same tree and only touches `rpm/` and `beelot.asc`, so the
  apt files keep their addresses. Signing mirrors the apt script: the passphrase is read on standard input, never traced.
- **Workflow:** the `apt-repo` job also collects `beelot-*.x86_64.rpm` from every release that has one (older releases
  have none), installs `createrepo-c`, and builds the rpm repository into the same `site/` directory before the Pages
  upload. The signing secrets and the skip-with-warning behaviour are the apt job's.
- **Signed how:** the metadata is signed (`repo_gpgcheck=1`) and lists each package's SHA-256, so a package cannot be
  swapped without breaking the signature. The RPMs are not signed one by one (`gpgcheck=0`): that needs `rpmsign` and
  a loopback passphrase flow that was not worth guessing without a way to run it. The backlog criterion was reworded.
- **Test:** `test-rpm-repo.sh` (in a `fedora:42` container, on every pull request): builds two stub RPMs, a throwaway
  key, the repository; checks the layout, the signature against `beelot.asc` in an empty keyring, a passphrase-protected
  key (right and wrong passphrase), that no private key is published, a real `dnf install` from a `file://` copy of the
  `.repo` with `repo_gpgcheck` on, a downgrade, and that a tampered `repomd.xml` is refused.
- **Page and README:** the Pages page and the README give the two `dnf` commands.
- **One architecture:** x86_64 only; US-137 adds arm64 and will split the directory.

## Not verified
Never run where it was written (no `createrepo_c`, `dnf`, Docker or network). Likely first-run issues: dnf 5's
handling of `repo_gpgcheck` for a `file://` repository (the tamper test may need a different way to be refused),
`dnf downgrade` syntax, and `createrepo-c` as the Ubuntu package name.
