# Plan: alert destinations (US-159)

1. `packaging/observability/beelot-alerts.json` (three alerts and their resolved companions); drop `beelot-alert.json`.
2. `load.sh`: destinations and templates from the variables, alerts from the list, attach the destination to alerts still on
   the placeholder.
3. `compose.yaml` and `.env.example`: the variables, `ZO_SMTP_*` on OpenObserve, the variables on the setup service.
4. `test-observability.sh`: listener, webhook, database stopped, wait for the alert.
5. README (the three alerts, variables, ntfy and Slack examples, a destination by hand), backlog note.
6. Not runnable here (no OpenObserve): fix against the first CI run.
