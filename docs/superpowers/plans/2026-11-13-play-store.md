# Plan: publish Beelot on Google Play (US-128)

1. `android-version.sh` and its test (growing, unique, refuses bad versions).
2. Gradle: optional `upload` signing config from the environment; test that nothing secret is tracked.
3. `build.yml`: `android-release` job (bundle, name, upload to the release; unsigned without the secrets).
4. Listing texts in three locales with a limits test.
5. README section and `docs/android/play-release.md` (keys, tracks, declarations, checklist).
6. Backlog note, PR (`feat:`), auto-merge, watch CI (the `android` workflow does not build `bundleRelease`; the job
   runs only on main).
