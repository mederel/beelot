# Plan: metrics through OpenTelemetry (US-155)

1. Dependencies: the `metrics` feature of `opentelemetry`, `opentelemetry_sdk` and `opentelemetry-otlp`. `Cargo.lock` needs
   no new crate beyond US-154's if the features add none; CI says.
2. `src/telemetry.rs`: `Signal` (endpoint and protocol variables per signal), `export_enabled(signal, lookup)`,
   `Telemetry { logs, metrics }` with `metrics_exported` and `shutdown`, `Started`, a shared `resource()`, and
   `build_providers` for the log exporter and the metric exporter with a `PeriodicReader`. Tests: the metrics' own endpoint,
   the SDK switch for both, the error naming the metrics variable.
3. `src/metrics.rs`: the labels (`method_label`, `kind_label`, `request_attributes`), the histogram, the two counters, the
   `track` middleware and `observe` (the gauges and the database task). Tests: bounded labels, the attributes of a request,
   two table identifiers give one route template, the middleware leaves the response alone.
4. Wiring: `track` as the first layer of the router (`app.rs`), `match_started` and `match_completed` in `table.rs`,
   `main.rs` calls `observe` when the metrics are exported.
5. `.github/scripts/test-container.sh`: the collector has a metrics pipeline; after the server stops, its output holds
   `http.server.request.duration` with the route `/api/version` and the status 200.
6. README (the metric table, the interval variable, the collector example), backlog note.
7. Checks where a toolchain exists: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test --workspace`. The metrics API calls were written without compiling, so CI is the first build.
