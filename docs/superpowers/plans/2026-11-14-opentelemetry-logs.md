# Plan: logs through OpenTelemetry (US-154)

1. Dependencies: `opentelemetry`, `opentelemetry_sdk`, `opentelemetry-otlp` 0.32 in `beelot-server`, the exporter with
   `http-proto`, `reqwest-blocking-client` and `reqwest-rustls-webpki-roots` and no default features. `Cargo.lock` is
   regenerated (no registry is reachable where this was written, so CI produces it). Renovate group "opentelemetry".
2. `src/logs.rs`: `MessageVisitor` becomes `pub(crate)` and is reused.
3. `src/telemetry.rs`: `export_enabled`, `Record`, `Sink`, `LogsLayer`, `severity`, `OtelSink`, `Telemetry`, `start`.
   Unit tests: off without endpoint, on with endpoint, `OTEL_SDK_DISABLED`, bad endpoint and bad protocol named, severity
   mapping, a Beelot warning exported, other fields dropped, other crates ignored, long message cut.
4. `src/main.rs`: start the telemetry before the subscriber, add the optional layer, flush on shutdown.
5. `.github/scripts/test-container.sh`: start a collector (`otel/opentelemetry-collector`, `debug` exporter), start the
   image against it with `OTEL_SERVICE_NAME=beelot-ci`, stop it with `docker stop`, find the record (service name,
   severity, message) in the collector's output and no address; a bad endpoint stops the start naming the variable.
6. README section "Send logs and metrics to OpenTelemetry", `packaging/debian/beelot.env` commented variables, backlog note.
7. Checks where a toolchain exists: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test --workspace`. The SDK calls (`LogExporter::builder().with_http()`, `SdkLoggerProvider`, `set_target`,
   `shutdown_with_timeout`) were written against the 0.32 documentation without compiling: CI is the first build.
