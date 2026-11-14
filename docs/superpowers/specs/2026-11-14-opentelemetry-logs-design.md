# Design: logs through OpenTelemetry (US-154)

## Goal

An operator sets the standard OpenTelemetry variables and the server's logs reach their collector. Nothing changes for
anyone who does not set them.

## Decisions

- **Crates.** `opentelemetry`, `opentelemetry_sdk` and `opentelemetry-otlp` (HTTP with protobuf, the blocking `reqwest`
  client of the SDK's batch thread, rustls with the bundled web PKI roots, so the binary needs no OpenSSL and keeps its
  glibc floor). Renovate updates the three together.
- **A layer of our own, not `opentelemetry-appender-tracing`.** The appender copies every field of an event into the
  record's attributes, and the fields may hold names, tokens or addresses (US-129, US-152). A `tracing` layer that reads
  the `message` field only, like the status page's `ErrorLog`, makes the privacy rule true by construction: there is no
  attribute list to forget to maintain. The layer builds the record through the stable OpenTelemetry Logs Bridge API
  (`Logger::create_log_record`), so the SDK, the batching and the exporter are the standard ones.
- **A sink between the layer and the SDK.** `LogsLayer` hands a small `Record` (time, level, target, body) to a `Sink`;
  `OtelSink` turns it into an OpenTelemetry record. The layer's rules are tested with a sink that keeps the records; the
  SDK's part is a few lines, tried against a real collector in CI (`test-container.sh`).
- **Configuration is the standard variables.** `export_enabled` reads them through a lookup function (testable without
  touching the process environment): no endpoint, blank values, or `OTEL_SDK_DISABLED=true` mean off; an endpoint that is
  not an http(s) address, or a protocol other than `http/protobuf`, is an error naming the variable. The exporter itself
  reads the endpoint, headers and timeout from the same variables, and `Resource::builder()` reads `OTEL_SERVICE_NAME` and
  `OTEL_RESOURCE_ATTRIBUTES`. The service name defaults to `beelot`.
- **Resource attributes:** `service.name`, `service.version` (`routes::version::VERSION`), `service.instance.id` (a UUID at
  each start).
- **Only Beelot's events.** The layer ignores any target that does not start with `beelot`. That also keeps the SDK's own
  internal events (target `opentelemetry*`), `hyper` and `reqwest` out of the export, so a failing export cannot feed
  itself. `RUST_LOG` applies, because the env filter sits under every layer of the registry.
- **A collector that does not answer.** The SDK's batch processor exports from its own thread through a bounded queue
  (2048 by default, `OTEL_BLRP_*` can change it) and drops records when it is full; the request threads only enqueue.
  The SDK reports a failed export through its internal events, which the formatted log prints.
- **Start and stop.** `telemetry::start()` runs before the subscriber is installed, so a wrong variable stops the start
  with a message. The exporter is built on a plain thread: the blocking HTTP client cannot be built or dropped on an async
  runtime thread. On shutdown `main` calls `Telemetry::shutdown` through `spawn_blocking`, which flushes for five seconds
  at most.
- **Message length.** The body is cut at 200 characters, like the status page's log.

## Not done

Traces, metrics (US-155), log sampling, gRPC, and a collector shipped with Beelot.

## Deviations from the story

The story said the attributes kept are on a list; with a layer that reads only the message, no attribute is kept, which
is stricter. It said the oldest records are dropped when the queue is full; the SDK drops the newest. It said failures are
reported once a minute; they are reported by the SDK's internal events as they happen.
