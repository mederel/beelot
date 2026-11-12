# Show the software version and link to its release notes (US-131)

- Build: `routes::version::VERSION` is `option_env!("BEELOT_VERSION")`, `dev` when unset. The release workflow sets
  `BEELOT_VERSION` (the value of `next-version.sh`) on its `cargo build`, and `build-deb.sh` sets it on the rebuild it
  does, so the tarball, the Debian package and the server's answer carry the same version as the `v<version>` tag.
  `Cargo.toml` keeps `0.1.0`.
- Config: `BEELOT_REPOSITORY_URL`, default `https://github.com/mederel/beelot`, documented in the README.
- API: `GET /api/version` (no sign-in) answers `{"version", "releaseUrl"}` with `Cache-Control: public, max-age=300`.
  `releaseUrl` is `<repository>/releases/tag/v<version>`, null for `dev` or a blank repository (`release_url`).
- Frontend: `version-label.js` fetches it once and fills `#app-version` in the home footer: a link (`target=_blank`,
  `rel="noopener noreferrer"`, title "Release notes") for a release, plain `Beelot dev` text otherwise, nothing when the
  request fails or the app is offline. Only `http(s)` links are used. The page asks GitHub for nothing; the player's
  click does. "Release notes" is translated into French and Dutch.
- Tests: `release_url` unit tests, a config test, `/api/version` in `skeleton.rs`, and `version-label.test.cjs`.
- Not verified here: the Rust crates were not compiled (no toolchain or crates.io); CI is the first full check. The
  workflow change is untested until the next release.
