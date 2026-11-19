# Tell the Android app's traces apart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label every browser span with `beelot.client.platform` (`android-app` or `web`) and show requests and errors by platform on the dashboard.

**Architecture:** `telemetry.js` reads the referrer once and adds `platform` to each span it builds; the route turns it into a two-value enum and an attribute; a trace-stream SQL panel and the privacy text follow; the CI posts a span of each value and finds both.

**Tech Stack:** vanilla JS (`node --test`), Rust (axum, opentelemetry), OpenObserve dashboard JSON, bash CI script.

**Spec:** `docs/superpowers/specs/2026-11-19-android-trace-platform-design.md`

## Global Constraints

- The attribute is `beelot.client.platform`; the only values are `android-app` and `web`.
- Detection is `document.referrer` starting with `android-app://`, read once when the script loads. No storage, no cookie.
- Nothing is sent when browser traces are off (the script is not loaded then); that stays true.
- The route never lets another value through: anything else, or nothing, is `web`.
- Texts exist in English, French and Dutch (FR/NL marked for native review, as before).
- Before the pull request: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `node --test crates/beelot-server/frontend-tests/*.test.cjs`.

## Review Focus

- A span from a page cached before this change has no `platform`: it is kept, as `web` (Task 2 test).
- A hand-made `platform` such as `ios-app` or `"><script>` never reaches an attribute: it becomes `web` (Task 2 test).
- The referrer is `undefined` or empty (direct visit, privacy settings): `web` (Task 1 test).
- The referrer is an `android-app://` address of another package: still `android-app`; the package is not kept (Task 1 test).
- An error span, which had no attributes, now has exactly the platform and nothing else (Task 2 test).

---

### Task 1: The client labels its spans

**Files:**
- Modify: `crates/beelot-server/static/telemetry.js`
- Test: `crates/beelot-server/frontend-tests/telemetry.test.cjs`

**Interfaces:**
- Produces: `platformOf(referrer: unknown): "android-app" | "web"` exported by `telemetry.js`; `fetchSpan`, `webSocketSpan` and `errorSpan` take a `platform` field and return it as `platform` in the span.

- [ ] **Step 1: Write the failing tests** in `telemetry.test.cjs`:
  - `platformOf("android-app://fr.beelot.app/")` and `platformOf("android-app://org.example.app")` are `"android-app"`; `platformOf("https://www.google.com/")`, `""`, `undefined`, `null`, `"android-app:/x"` are `"web"`.
  - the key list of the three span builders in the existing test "a span holds only the fields written for its kind" gains `"platform"` (builders called with `platform: "web"`).
  - a new test installs with `document: { cookie: "", referrer: "android-app://fr.beelot.app/" }`, makes a call, flushes, and asserts `body.spans[0].platform === "android-app"`; the same with `referrer: ""` gives `"web"`. The existing install test (no `referrer` key) must still pass and give `"web"`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/telemetry.test.cjs`. Expected: FAIL (`platformOf is not a function`).
- [ ] **Step 3: Implement** `platformOf` and the field: the three builders take and return `platform`; `install` computes `const platform = platformOf(win.document && win.document.referrer)` once and passes it at every `record(...)` call. Add `platformOf` to `module.exports`. Update the file's header comment to say the span also holds the kind of client.
- [ ] **Step 4: Run** the same command. Expected: all pass.
- [ ] **Step 5: Commit** `git add crates/beelot-server/static/telemetry.js crates/beelot-server/frontend-tests/telemetry.test.cjs && git commit -m "feat: label the browser spans with the kind of client"`

### Task 2: The route keeps two values and adds the attribute

**Files:**
- Modify: `crates/beelot-server/src/browser_traces.rs`
- Test: same file (`mod tests`) and `crates/beelot-server/tests/browser_traces.rs`

**Interfaces:**
- Consumes: the `platform` field of Task 1's spans.
- Produces: `pub enum Platform { AndroidApp, Web }` with `fn label(&self) -> &'static str` (`"android-app"`, `"web"`); `Checked.platform: Platform`; `describe` output containing `beelot.client.platform`.

- [ ] **Step 1: Write the failing tests** in `mod tests`: `incoming()` gains `platform: String::new()`; add `a_missing_or_foreign_platform_is_web` (empty, `"ios-app"`, `"\"><script>"` give `Platform::Web`), `the_app_platform_is_kept` (`"android-app"` gives `Platform::AndroidApp`); update `a_span_has_only_the_attributes_listed` so the fetch list ends with `"beelot.client.platform"` and the error span's list is exactly `["beelot.client.platform"]`; add a WebSocket case listing `http.route` then `beelot.client.platform`. In `tests/browser_traces.rs` add a test that the body with `"platform":"android-app"` and the body without it both parse to 1 span (use `Batch` through the public route only if the route is on in `test_state`; otherwise assert the existing 404 behaviour is unchanged and cover parsing with the unit test `a_body_with_more_fields_is_read_without_them` extended with a `platform` field).
- [ ] **Step 2: Run** `cargo test -p beelot-server browser_traces`. Expected: FAIL to compile (no `Platform`).
- [ ] **Step 3: Implement** `Incoming.platform` (`#[serde(default)] String`), `Platform` and `check` setting `platform` (`"android-app"` → `AndroidApp`, else `Web`), `Checked.platform`, and `describe` pushing `KeyValue::new("beelot.client.platform", span.platform.label())` last in every kind. Update the module doc comment.
- [ ] **Step 4: Run** `cargo test -p beelot-server browser_traces && cargo clippy --all-targets -- -D warnings && cargo fmt --check`. Expected: pass.
- [ ] **Step 5: Commit** `git add crates/beelot-server && git commit -m "feat: keep the kind of client on the browser spans"`

### Task 3: Dashboard panel, privacy text and README

**Files:**
- Modify: `packaging/observability/beelot-dashboard.json`, `crates/beelot-server/static/privacy-policy.json`, `README.md`
- Test: `crates/beelot-server/frontend-tests/privacy-policy.test.cjs` (existing three-language and placeholder tests), a new assertion in `observability-load.test.cjs` or the dashboard's existing test if one reads the JSON

**Interfaces:**
- Produces: a panel titled `Requests and errors by platform` with `queryType: "sql"` and `stream_type: "traces"`; the privacy paragraph saying the kind of client is sent.

- [ ] **Step 1: Find the real column names.** Run the stack as `test-observability.sh` does (or `docker compose --profile observability up`), post one span of each platform (Task 4's command), then `curl -u … "$o2/api/default/_search?type=traces"` with `SELECT * FROM "default" WHERE service_name = 'beelot-web' LIMIT 1` and read the key of the platform and of the error flag. Write both names in the commit message. Expected: one name each (likely `beelot_client_platform`; confirm, do not assume).
- [ ] **Step 2: Write the failing tests:** a test that the dashboard JSON has a panel titled `Requests and errors by platform` whose query mentions the platform column found in Step 1 and `beelot-web`; the privacy test file needs no change (it checks the three languages and placeholders), but add an assertion that the `data` section's diagnostics paragraph contains `Android` in `en` and the policy `version` is today's date.
- [ ] **Step 3: Implement** the panel after the last existing one (same `layout` style, next free `id`, `w: 24`), the paragraph (EN: "…and whether the page was opened by the Android app or by the website") in the three languages, `version` set to `2026-11-19`, and in the README "Traces from the browser" paragraph: the kind of client is sent, and a reload inside the Android app is counted as `web`.
- [ ] **Step 4: Run** `node --test crates/beelot-server/frontend-tests/*.test.cjs`. Expected: pass.
- [ ] **Step 5: Commit** `git add packaging/observability/beelot-dashboard.json crates/beelot-server/static/privacy-policy.json crates/beelot-server/frontend-tests README.md && git commit -m "feat: show requests and errors by platform and say it in the privacy policy"`

### Task 4: The CI finds both values

**Files:**
- Modify: `packaging/container/compose.yaml`, `.github/scripts/test-observability.sh`

**Interfaces:**
- Consumes: the route of Task 2 and the column name found in Task 3.

- [ ] **Step 1: Implement the failing check first** in `test-observability.sh`: after "OpenObserve has no span GET /api/version", post `{"spans":[…]}` with one `fetch` span per platform (valid 32- and 16-hex ids, `startMs`/`endMs` of now)  (a guest needs no CSRF token), wait (loop of 12 × 5 s, as the log check does) and fail with `no span of the app` or `no span of the website` unless `SELECT … WHERE service_name = 'beelot-web' AND <platform column> = '<value>'` has a hit for each. Add `BEELOT_BROWSER_TRACES=true` to the `.env` the script writes.
- [ ] **Step 2: Run** the script against the current image (`.github/scripts/test-observability.sh IMAGE`, Docker running). Expected: FAIL with `BEELOT_BROWSER_TRACES` ignored (the route answers 404), proving the check bites.
- [ ] **Step 3: Implement** in `compose.yaml`: `BEELOT_BROWSER_TRACES: ${BEELOT_BROWSER_TRACES:-}` under the Beelot service (next to the `OTEL_*` lines, empty meaning off).
- [ ] **Step 4: Run** the script again with an image built from this branch. Expected: ends with the memory and image lines, no `FAIL`.
- [ ] **Step 5: Commit** `git add packaging/container/compose.yaml .github/scripts/test-observability.sh && git commit -m "ci: check that the traces carry both platforms"`

### Task 5: Backlog and pull request

**Files:**
- Modify: `docs/product-backlog.md` (US-162 "Delivered" paragraph)

- [ ] **Step 1:** Add the `Delivered:` paragraph after US-162's out-of-scope line, in the style of US-160 and US-161: the spec and plan paths, what was built, deviations found, and what was not verified (the referrer on a real phone; the dashboard panel drawn in the web interface unless looked at).
- [ ] **Step 2: Run** the four commands of Global Constraints. Expected: all pass.
- [ ] **Step 3: Commit and open the pull request** titled `feat: tell the Android app's traces apart`, after `git fetch origin main:main` and a rebase on it; the description lists the commands run and anything not run.
