# Publish Beelot on Google Play (US-128)

- **Release bundle:** a new job `android-release` in `build.yml` runs after the server release, builds
  `bundleRelease` with `versionName` = the release version and `versionCode` = `major*1,000,000 + minor*1,000 +
  patch` (`.github/scripts/android-version.sh`, which refuses anything but `x.y.z` with minor and patch below 1000),
  and uploads `beelot-<version>.aab` to the GitHub release. The job needs no secret to run: without the upload key it
  builds `beelot-<version>-unsigned.aab` and warns, so a missing secret never blocks the server release.
- **Signing:** `android/app/build.gradle.kts` creates the `upload` signing config only if `BEELOT_UPLOAD_KEYSTORE` is
  set in the environment (the passwords, alias too). The keystore comes from the secret
  `ANDROID_UPLOAD_KEYSTORE_BASE64`, decoded to the runner's temp directory. Nothing secret is in the repository; a test
  checks that no keystore is tracked and no password is literal in the Gradle file.
- **Listing:** `android/store/{en-US,fr-FR,nl-NL}/{title,short_description,full_description}.txt` (fastlane layout), with
  a test of Play's limits and of the privacy link. The descriptions only state what the app does (modes, bots,
  tutorial, hints and review, tables, ratings, three languages, guest play, passkey account, export and deletion, no
  ads, no trackers).
- **Documentation:** README ("Publishing on Google Play") and `docs/android/play-release.md`: keys, tracks, every
  Play Console declaration (Data safety, content rating, audience, account deletion), the release checklist.

## Open points
- **Screenshots** of the table and the home screen at phone size, in three languages: they need an installed app or an
  emulator, which this change could not run. The folder and sizes are documented.
- **Real signing, upload and device run** have not been done; the first release with the secrets is the first test.
- Play's current rules (testers and days for personal accounts, target API level) change; the document says to check.
- Rust was not touched; the Android build was not run locally.
