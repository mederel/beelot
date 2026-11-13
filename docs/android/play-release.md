# Releasing Beelot on Google Play (US-128)

The answers below match the privacy policy (US-129) and the website. If the policy changes, change them too.

## Keys

- **Upload key:** made once with `keytool` (README, "Publishing on Google Play"), kept outside the repository, and given
  to CI only as the four `ANDROID_UPLOAD_*` secrets. Back it up: with Play App Signing a lost upload key can be reset
  through Play support, but it takes days.
- **Play App Signing:** accept it when creating the app. Google holds the key that signs what players install; the
  bundle is signed with the upload key only. Never sign a release by hand with a key that is not the upload key.
- **After the first upload**, copy the *App signing key certificate* SHA-256 from Play Console → Test and release →
  App signing into `BEELOT_ANDROID_CERT_SHA256` on the server, or the app opens with an address bar. Downloads of the
  bundle for the Galaxy Store, or sideloaded builds, are signed with other keys; add their fingerprints too.

## Tracks

1. **Internal testing** (up to 100 testers, no review wait): every release goes here first. Check on a real device that
   the app opens full screen, passkey sign-in works, back leaves the app from the first page, and offline shows the
   offline note.
2. **Closed testing**: a personal developer account created recently must run it with the number of testers and for the
   period Google currently requires before it may ask for production access. Check Google's current rule.
3. **Production**: promote the tested release.

## Listing

- Texts: `android/store/en-US`, `fr-FR`, `nl-NL` (`title.txt` ≤ 30, `short_description.txt` ≤ 80,
  `full_description.txt` ≤ 4000 characters; a test enforces it). Default language: English.
- Icon: 512 × 512 PNG, the site's icon. Feature graphic: 1024 × 500.
- **Screenshots (not yet in the repository):** at least 2 phone screenshots per language, 9:16, of the home screen and of
  the table, taken from the installed app on a device or emulator, and put in
  `android/store/<locale>/images/phoneScreenshots/`.
- Privacy policy URL: `https://beelot.fr/privacy`.

## Play Console declarations

**App content**
- *Privacy policy:* the URL above.
- *Ads:* none.
- *App access:* no restricted features; guests can play everything. No test login is needed. (An account is optional.)
- *Target audience:* choose ages 13 and over only. The app is not directed at children under 13 and is not in the
  Families program.
- *Content rating:* answer the questionnaire for a card game with no violence, no gambling with real money, no user
  purchases, and user-to-user interaction limited to table invitations between friends and seat reactions. Expect a
  low rating (PEGI 3 / Everyone). Re-answer if chat is ever added.
- *News app, COVID-19 app, government app, financial features:* no.
- *Account deletion:* the app lets players create accounts, so Play asks for the way to delete one. In the app:
  Settings → Delete my account. Web link: `https://beelot.fr/settings` (sign in with the passkey, then use the same
  button). Deleting removes the account, its passkey and its security events immediately; finished matches stay in the
  other players' history as "Deleted player".

**Data safety** (all data is encrypted in transit, HTTPS; players can ask for deletion)

| Question | Answer |
| --- | --- |
| Collects or shares data | Collects: yes. Shares with third parties: no |
| Personal info: name, email, address, phone | Not collected (a pseudonym the player chooses is kept; declare it as *User IDs*) |
| Personal info: User IDs | Collected, **optional** (accounts are optional), for account management and app functionality; not shared |
| Authentication | A passkey's public key is kept; the private key and biometrics never leave the device. No password |
| App activity | Collected, optional: finished matches, ratings and friends, for app functionality; not shared |
| Device or other IDs | Collected: an IP token (a keyed hash of the IP address, not the address) in security logs, for security and fraud prevention, kept 365 days; not shared |
| Location, contacts, photos, files, audio, health, finance | Not collected |
| Data deletion | Players can request deletion in the app and on the web (links above) |
| Data not used for ads or tracking | Correct; no advertising SDK, no analytics |

## Release checklist

1. Merge to `main`; wait for the release and the `android-release` job; download `beelot-<version>.aab`
   (if it is named `-unsigned`, the secrets are missing).
2. Play Console → Internal testing → Create release → upload the bundle → paste short release notes
   (the GitHub release notes are linked from the app: US-131).
3. Install from the testers' link; run the checks under *Tracks*.
4. Promote to closed testing or production.

## What was not verified when this was written

The bundle was never built, signed, uploaded or run on a device by the author of this change: there was no Android SDK,
no Play account and no network. The first release with the secrets set is the first real test.
