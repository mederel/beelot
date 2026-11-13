# Plan: a multi-architecture container image (US-144)

1. `container` pushes `<version>-amd64`; `release-arm64` builds, tests and pushes `<version>-arm64`.
2. `container-manifest` joins them into `<version>` and `latest`.
3. README, the story's delivered line, a wiring test.
