# Play Beelot as an Android app (US-127)

- App: `android/`, a Gradle project (AGP 8.13, compileSdk and targetSdk 35, minSdk 26) with no code of its own. The
  `LauncherActivity` of `androidbrowserhelper` 2.5.0 opens `https://<beeloHost>/` as a Trusted Web Activity, with an
  `autoVerify` intent filter for the host. `beeloHost` (default `beelot.fr`) and `beeloApplicationId` (default
  `fr.beelot.app`) are Gradle properties.
- Look: the launch screen, status bar and navigation bar use the web manifest's `#071a20` (US-073); the launcher icon
  is the site's 192 px icon. The app name and description are translated (en, fr, nl).
- Back button, offline: the TWA's default. Back goes through the site's history (sheets, tabs, routes) and leaves the
  app from the first page. The offline shell of US-073 is served by the site's service worker.
- Passkeys: the app declares `asset_statements` with `handle_all_urls` and `get_login_creds` for the site, generated
  from `beeloHost`, and the site's `/.well-known/assetlinks.json` declares the same two relations for the app. The
  relying party stays the site's domain.
- Server: `GET /.well-known/assetlinks.json` (`routes/assetlinks.rs`) from `BEELOT_ANDROID_PACKAGE` and
  `BEELOT_ANDROID_CERT_SHA256`. Fingerprints are checked at startup (32 hex pairs); with none the file is `[]`, which is
  valid and verifies no app.
- Build: `android/build.sh` has Gradle generate a wrapper pinned to 8.14.3, then runs the task (default `assembleDebug`).
  `.github/workflows/android.yml` runs it for changes under `android/`, with the tools the runner has, since actions
  are pinned by SHA in this repository and none was added.
- Not verified: neither the Rust nor the Android build could be run where this was written (no toolchain, SDK or
  network), and the app was not run on a device. The workflow is the first build. Not done: the fingerprint in the
  repository (needs the signing key), a check of the live site's file in CI, store assets and release signing (US-128).
