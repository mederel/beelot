# Plan: a Gentoo ebuild (US-138)

1. The overlay skeleton, `acct-user` and `acct-group`, the OpenRC script and the ebuild template.
2. `gentoo-ebuild-data.py` (crates and licences) and `prepare-ebuild.sh` (overlay and Manifest); try the generator on
   `Cargo.lock` with synthetic metadata.
3. `test-gentoo-ebuild.sh` and the `gentoo` CI job behind the `changes` job's `gentoo` output.
4. README section; fix what the first CI run shows.
