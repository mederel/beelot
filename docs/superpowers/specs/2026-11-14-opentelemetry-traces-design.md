# Design: traces through OpenTelemetry (US-156)

## Goal

An operator who set an OTLP endpoint sees a trace of each request, and can go from a log line to the request that wrote it.

## Decisions

- **The OpenTelemetry API, not `tracing` spans.** The `tracing-opentelemetry` bridge turns every field of a span into an
  attribute, so a field added later would leak by default, and its version must match the SDK's. Spans made directly with
  the API carry exactly the attributes the code writes (`request_attributes`, `database_attributes`, `table_attributes`),
  which tests list. No crate is added: the `trace` feature of the three OpenTelemetry crates already in use is enough.
- **Context follows the request.** The request middleware starts the server span, makes it the current context for the
  duration of the answer with `FutureExt::with_context` (so it is current each time the request's future is polled, on
  whatever thread), and ends it with the status. Database and table-action spans are children of the current context.
- **Spans.** One server span per request, named `{method} {route}` (the matched template, the method alone when none
  matched), with `http.request.method`, `http.route`, `http.response.status_code`, and the error status for a 5xx. One client
  span `beelot.db {function}` around each of the 46 public async functions of `db/` (applied mechanically), with
  `db.system.name=mariadb` and no statement. One internal span `beelot.table act` with `beelot.table.kind` around
  `TableRegistry::act`. The action's name is not an attribute: it is one of many variants and adds little.
- **Parent.** A `traceparent` header is read by the W3C propagator through a small `Extractor` over the header map; the
  response sets none. No `url.scheme`: the server sees plain HTTP behind its proxy, so the value would mislead.
- **Off means off.** `traces::enable()` is called by `telemetry::start` when the spans are exported; until then the
  middleware and the two helpers call straight through, without allocating a span or a name.
- **Export.** The same switch as the other signals (`Signal::Traces`: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, then the shared
  variables), the SDK's batch span processor on its own thread, the standard sampler variables (the SDK's default is
  `parentbased_always_on`), the same resource, the same five-second flush at shutdown, and the same refusal of a bad endpoint
  or protocol by name.
- **Log correlation.** `LogsLayer` reads the current context when it hands a record to the sink; a valid span context puts
  its trace identifier, span identifier and flags on the record, which the OpenTelemetry sink sets with `set_trace_context`.

## Not done

Traces from the browser, span links, tail sampling, spans for the bots' moves, and the dashboards (US-157).

## Deviations from the story

The `tracing-opentelemetry` bridge and the exporter wrapper with an allowlist are replaced by spans whose attributes are
fixed in the code; `url.scheme` is not set; the table action's name is not an attribute; the in-memory exporter test is
replaced by tests of the names, the attributes, the parent extraction and the log correlation, and the CI collector.
