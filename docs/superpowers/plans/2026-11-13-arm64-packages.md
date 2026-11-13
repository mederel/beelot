# Plan: packages for arm64 (US-137)

1. Make the deb and rpm build and check scripts detect the architecture; drop `BuildArch` from the spec.
2. Make `build-apt-repo.sh` index each architecture present and `build-rpm-repo.sh` glob both RPM names; extend
   `test-apt-repo.sh` with an arm64 stub and checks.
3. CI: matrix the `package` job over amd64 and arm64; add `release-arm64`; make `apt-repo` wait for it and collect both
   architectures.
4. README and page: list both architectures, drop `Architectures: amd64` from the apt snippet.
