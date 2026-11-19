# Design: tell the Android app's traces apart (US-162)

The Android app is a Trusted Web Activity: Chrome shows the live website full screen, so the browser spans of US-158
already come from it. This story labels them, so that an operator can tell a problem of the app from one of the website.

- **One attribute, two values.** Every span of the browser carries `beelot.client.platform`: `android-app` when the page
  was opened by the app, `web` otherwise. Nothing else about the device, the app or the player is sent.
- **Detection: the referrer.** A page opened by a Trusted Web Activity has a `document.referrer` that starts with
  `android-app://` (the app's package). Chosen over the standalone display mode, which is also true for a web app that
  Chrome installed, and would mislabel it. Beelot is one page (`index.html` and the `app*.js` scripts) whose screens change
  without a page load, so the referrer read when the script loads holds for the whole visit. The case it misses is a page
  loaded again by a navigation inside the app (after signing out, for example): the server sends `Referrer-Policy:
  no-referrer`, so that page has no referrer and its spans say `web`. That is accepted, and written in the
  README rather than worked around, because the only fix is storing the answer on the device, which the story forbids.
- **Client (`static/telemetry.js`).** `platformOf(referrer)` returns `"android-app"` when `String(referrer)` starts with
  `android-app://`, and `"web"` for anything else (empty, absent, a web address). `install` calls it once with
  `win.document.referrer` and adds `platform` to the fetch, WebSocket and error spans, through the three span builders. No
  storage, no cookie, nothing read before the script is loaded, and the script is only loaded when browser traces are on
  (US-158), so nothing is sent with them off.
- **Route (`src/browser_traces.rs`).** `Incoming` reads `platform` (default empty). `check` keeps `android-app` and turns
  every other value, or none, into `web`: a span from a page cached before this change is still a good span, and a foreign
  value is dropped from the span, not the span itself. `Checked` holds a `Platform` enum with the two values, so no other
  string can reach an attribute. `describe` adds `beelot.client.platform` as the last attribute of fetch and WebSocket
  spans; an error span, which had none, now has this one alone, so errors can be counted by platform.
- **Dashboard (`packaging/observability/beelot-dashboard.json`).** One panel, "Requests and errors by platform": an SQL query
  on the traces stream counting the spans of `beelot-web` by `beelot.client.platform` (`web` when a span from before the change has none) and
  by whether the span is a failed call (`beelot.client.error`) or an uncaught error (`browser error`), as a stacked bar over time. The existing panels read metrics; this one reads traces, since the platform is a span
  attribute and the metrics of the server do not know the client. The column names OpenObserve gives the attributes are not
  known from the documentation: the plan finds them on a running stack and the CI query uses the same ones.
- **Privacy (`static/privacy-policy.json`, US-130).** The "Diagnostics" paragraph of the data section says, in the three
  languages, that the kind of client, the Android app or the website, is sent with the reports; the policy's `version` date
  moves to the day of the change. The README paragraph "Traces from the browser" says the same and names the reload case.
- **CI (`.github/scripts/test-observability.sh`).** The compose file passes `BEELOT_BROWSER_TRACES` through (empty by
  default, so nothing changes for operators) and the script sets it to `true`. After the match it posts one batch with a
  span of each platform to `/api/telemetry/spans` (a guest has no session, so the route asks for no CSRF token) and fails unless
  OpenObserve finds a span of `beelot-web` for each value.

## Tests

- Frontend (`frontend-tests/telemetry.test.cjs`): `platformOf` for the app's referrer, an app referrer with other letters
  in its package, a web address, an empty string and `undefined`; the three span kinds carry `platform`; a page opened with
  the app's referrer sends spans saying `android-app`, one opened without it `web`.
- Server (unit tests of `browser_traces.rs`): `android-app` kept, `web` kept, a missing value, `ios-app` and an
  injection-like string all become `web`; fetch, WebSocket and error spans list `beelot.client.platform` last (and alone for
  errors); the list test of "a span has only the attributes listed" is updated.
- Server: a body with a `platform` field is read, and the body of an older client without one still is (a unit test, since the
  route is off in the integration tests' state).
- CI: both values found in OpenObserve, as above.

## Out of scope

Native crash reports (the app has no native code), the device model, the Android version, the app's version or build, and
any storage on the device.

## Not verified before the build

That the dashboard's SQL works against the column names of the real stream, and that the referrer is what Chrome gives a
Trusted Web Activity on a real phone (it is documented behaviour, and is checked here with a simulated referrer only).
