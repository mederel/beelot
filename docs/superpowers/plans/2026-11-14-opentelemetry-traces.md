# Plan: traces through OpenTelemetry (US-156)

1. Features: `trace` on `opentelemetry`, `opentelemetry_sdk` and `opentelemetry-otlp`.
2. `src/telemetry.rs`: `Signal::Traces`, a `Wanted` set and `Providers` tuple, the span exporter and the tracer provider,
   the W3C propagator and the global tracer provider installed in `start`, `Telemetry::shutdown` flushes the spans,
   `Record.trace` and its mapping to `set_trace_context`. Tests: the traces endpoint and protocol variables; an event inside
   a span context carries its identifiers, outside carries none.
3. `src/traces.rs`: `enable`, the header extractor, `request_span_name`, the three attribute functions, `track` (middleware),
   `db` and `table_action`. Tests: names, attributes, `traceparent` parent, no parent, calls go straight through when off.
4. Wiring: `traces::track` in the router (`app.rs`), `table_action` around `handle.act` in `TableRegistry::act`, and
   `traces::db` around the body of each public async function of `db/*.rs` (a mechanical wrap).
5. `.github/scripts/test-container.sh`: the collector has a traces pipeline; its output holds a span `GET /api/version`.
6. README (variables, span list, privacy statement), backlog note.
7. Checks where a toolchain exists: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test --workspace`. The API calls were written without compiling, so CI is the first build.
