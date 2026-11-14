# Design: metrics through OpenTelemetry (US-155)

## Goal

An operator who set an OTLP endpoint for the logs (US-154) also gets the server's metrics at the same endpoint, with no new
setting beyond the standard `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` and `OTEL_METRIC_EXPORT_INTERVAL`.

## Decisions

- **Global meter.** The instruments are made from `opentelemetry::global::meter("beelot")` the first time they are used.
  `telemetry::start()` installs the SDK's meter provider as the global one when the metrics are exported; until then, and
  always when they are not, the instruments are no-ops, so no handle is passed through `AppState` and a test builds a table
  without any provider.
- **One switch per signal.** `telemetry::Signal` gives each signal its endpoint and protocol variables, then the shared
  ones. `OTEL_SDK_DISABLED` turns both off. A bad endpoint or protocol of either signal stops the start naming the variable.
  Logs and metrics are built on one plain thread (the blocking HTTP client cannot be built on an async runtime thread) and
  share one resource (`service.name`, `service.version`, `service.instance.id`).
- **The SDK's periodic reader** exports on its own thread at the standard interval (60 seconds by default), with the
  default cumulative temporality. `Telemetry::shutdown` flushes both signals, for five seconds at most each.
- **HTTP duration.** An axum middleware, the outermost layer of the router, times each request and records it with the
  method, the route and the status. The route is axum's `MatchedPath`, the template the router matched
  (`/api/tables/{id}`), or `unmatched` for the static files and the 404s; the method is one of the seven standard ones or
  `_OTHER`. Because attributes are built from these bounded values only, no identifier, path or address can become a series.
- **Gauges.** `beelot.tables.open` (by kind) and `beelot.players.connected` are observable gauges whose callbacks call
  `TableRegistry::kind_counts` and `connected_players`, the functions of the status page (US-152), at each export.
- **Database.** An observable callback is synchronous and cannot wait on the database, so a task asks
  `database_reachable` (US-151) every 15 seconds and the gauge reports the last answer. The task and the gauges exist only
  when the metrics are exported, so a server without an endpoint asks the database no more often than before.
- **Counters.** `beelot.matches.started` is incremented where a match is dealt (`Table::begin_match`) and
  `beelot.matches.completed` where a match reaches its target (the place that creates the `FinishedMatch`), both with the
  table's kind.

## Not done

Traces (US-156), the dashboards and alert (US-157), exemplars, and a `/metrics` route.

## Deviations from the story

The database gauge reads a check made every 15 seconds, not one made per export.
