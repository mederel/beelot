# Design: load every alert however late the first request comes (US-161)

- **Cause, found by reproducing.** `test-observability.sh` on the CI image ended with "no `http_server_request_duration_seconds_count`
  from Beelot after 3 minutes: the alert beelot-error-share is not loaded" although the CI had sent requests. OpenObserve's
  metric streams of that run were `beelot_database_up`, `beelot_players_connected`, `beelot_tables_open` and
  `http_server_request_duration_{count,bucket,sum,min,max}`: the request histogram's streams carry no unit, so the name the alerts
  (and three panels of the dashboard) used never exists. Two defects: the wrong names, and a wait that gives up after three
  minutes whereas the real stream appears only with the first request, which may be days after the install.
- **Names.** `http_server_request_duration_seconds_` becomes `http_server_request_duration_` in `beelot-alerts.json` (stream
  names and PromQL) and `beelot-dashboard.json`. The labels (`http_route`, `http_response_status_code`) are those of the real stream.
  Thresholds, windows and destinations are unchanged.
- **The setup stays up and looks again** (the "design says" of the story). `load.sh` runs one pass over the alerts: an alert whose
  stream exists is created, one that exists is left alone (or moved off the placeholder), one whose stream is missing is counted as
  pending and left for the next pass. While alerts are pending the script sleeps `OPENOBSERVE_SETUP_INTERVAL` seconds (30 by
  default, never zero) and does another pass; with none pending it prints "all the alerts are loaded" and ends with status 0.
  A periodic run (cron, a second service) was not chosen: it needs a scheduler image and leaves a fresh install with no alert for
  as long as its period. The service costs one idle shell.
- **Compose.** `openobserve-setup` has `restart: on-failure`: a failure (OpenObserve not up yet, a refused request) is retried by
  the engine, a run that ended is not restarted. `OPENOBSERVE_SETUP_INTERVAL` is passed through.
- **Order.** The destinations and templates no longer wait for any stream (the old script waited for the database metric before
  anything but the dashboard). The dashboard, the templates and the destinations are created on the first pass.
- **Log.** One line when the script waits ("waiting for the metrics of Beelot ...: not loaded yet: <alerts> (looking again every 30 s)"),
  repeated only when the set of awaited alerts changes and every twentieth look (10 minutes); one line per alert loaded; one
  final line. No line per look.
- **Idempotence.** Unchanged: what exists is left alone. The CI waits for the first run to end before the second one, so two
  loops never run together (two could both create the same alert).
- **CI.** `test-observability.sh` starts `openobserve-setup` in the background right after the stack and before the traffic,
  plays the match, then waits up to two minutes for the six alerts to exist and for "all the alerts are loaded" in the service's
  log; it fails with the names of the missing alerts. The second run must still be a no-op. The old wait that ended in "not
  loaded" is gone.
- **Test of the script.** `frontend-tests/observability-load.test.cjs` runs `load.sh` against a fake of the OpenObserve API and a fake
  `sleep` that moves a virtual clock: a stream that appears 400 s (more than the old 180 s) after the start still gets its alerts,
  the log does not grow with each look, nothing is created twice, a second run waits for nothing, and without a destination the
  three alerts that fire are loaded. It also checks that the dashboard and the alerts use only the names OpenObserve makes.
