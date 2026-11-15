# Plan: traces from the browser (US-158)

1. `static/telemetry.js` and `frontend-tests/telemetry.test.cjs` (traceparent, route, error type, same-origin only, fields).
2. `config.browser_traces`; `src/browser_traces.rs` (checks, `describe`, `emit`, route with a 64 KiB limit); `telemetry.rs`
   builds the `beelot-web` provider; `/api/version` says `browserTraces`; `version-label.js` loads the script.
3. `tests/browser_traces.rs`: the route is 404 and the client not told while off.
4. `test-container.sh`: the collector gets a `beelot-web` span with the route template and none of the dropped fields.
5. README, privacy policy section, backlog note. 6. Fix against the first CI run: the span-identifier API was not compiled.
