# Design: a complete observability stack (US-157)

- **Backend.** OpenObserve in one container, as the profile `observability` of the compose file: OTLP/HTTP in on the compose
  network (`/api/default`), web interface on `127.0.0.1:5080`, data in the volume `beelot-openobserve`, retention from
  `OPENOBSERVE_RETENTION_DAYS` (`ZO_COMPACT_DATA_RETENTION_DAYS`), root user from `.env` and refused when missing. No collector.
- **Beelot's side.** Beelot reads empty `OTEL_*` variables as unset, so the compose file always passes them (empty by
  default) and the operator fills them in `.env`; nothing changes without them.
- **Content.** `packaging/observability/` holds the dashboard (version 5, PromQL for the metrics, SQL for the log table), the
  alert (`beelot-database-down`, PromQL, no destination) and `load.sh`, which loads each only if it is absent. A one-shot
  `openobserve-setup` service runs it.
- **CI.** `test-observability.sh` starts the profile with the CI image, runs the setup twice, sends requests, then searches
  the log, the span `GET /api/version`, the request metric stream, the dashboard and the alert, and prints memory and image size.
