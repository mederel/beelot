# Packages for arm64 (US-137)

## Goal

Operators with an ARM server or a Raspberry Pi install Beelot from the apt and dnf repositories like everyone else.

## Design

- The package scripts take the architecture of the machine they run on: `build-deb.sh` and `check-deb.sh` use
  `dpkg --print-architecture`, `build-rpm.sh` and `check-rpm.sh` use `uname -m`, and the spec no longer sets
  `BuildArch`. Nothing is cross-compiled: the arm64 packages are built natively on an `ubuntu-24.04-arm` runner, which
  keeps the glibc requirement and the build identical to amd64.
- The `package` job of a pull request is a matrix over both runners. The build, the check, lintian and the install tests
  on Debian and Fedora run for both; the site, apt-repository and dnf-repository script tests run once, on amd64.
- On main, the `release` job still publishes amd64. A `release-arm64` job then builds, checks and uploads the arm64
  `.deb` and `.rpm` to the same release. The `apt-repo` job waits for it but runs even if it failed, so a failure never
  blocks the amd64 repository; the next release repairs it.
- `build-apt-repo.sh` writes a `binary-<arch>` index for each architecture that has a package, and the `Release` file
  lists them. The apt source snippets drop `Architectures: amd64` so apt uses the machine's own. `build-rpm-repo.sh`
  globs both RPM names; dnf picks the right one.

## Not verified here

Nothing was built or run locally; CI on both runners is the check. An arm64 release's packages appear a few minutes
after the amd64 ones.
