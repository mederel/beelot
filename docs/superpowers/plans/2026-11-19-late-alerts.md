# Plan: load every alert however late the first request comes (US-161)

1. Reproduce: build the CI image and run `.github/scripts/test-observability.sh beelot:ci` on the unchanged tree; read the
   stream names OpenObserve really made.
2. `frontend-tests/observability-load.test.cjs` (fails on the old script: fake API, fake clock).
3. `packaging/observability/load.sh`: one pass per look, `OPENOBSERVE_SETUP_INTERVAL`, the log lines, the end line.
4. `beelot-alerts.json`, `beelot-dashboard.json`: the real stream names.
5. `packaging/container/compose.yaml`: `restart: on-failure`, the interval variable.
6. `.github/scripts/test-observability.sh`: start the setup before the traffic, require the six alerts and the end line.
7. README, backlog. 8. Run the full script on the new tree, then the usual four commands.
