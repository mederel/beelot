# Design: alert destinations (US-159)

- **Variables** (`.env`, all optional): `OPENOBSERVE_ALERT_WEBHOOK_URL`, `OPENOBSERVE_ALERT_WEBHOOK_FORMAT` (`json`, the
  default, or `text`), `OPENOBSERVE_ALERT_EMAIL` with `OPENOBSERVE_SMTP_*` (host, port, user, password, from, encryption, and
  `OPENOBSERVE_SMTP_ENABLED`) handed to OpenObserve as `ZO_SMTP_*`, and `OPENOBSERVE_PUBLIC_URL` (default
  `http://127.0.0.1:5080`) for the link in the message. With no webhook and no email nothing new is created: the
  placeholder destination of US-157 stays, and the three alerts are loaded on it.
- **Message.** OpenObserve has no variable for the state, so there is one template per state, and the state is a word of
  the text. The body holds `{alert_name}` (the only variable used; `{timestamp}` is not filled in by OpenObserve), the state and the dashboard link:
  no log line, no value from a player. `json` sends `{"text": M, "content": M}` (Slack, Mattermost and Discord ignore the
  key they do not know); `text` sends `M` alone (ntfy, on a topic URL).
- **Destinations.** `beelot-webhook` and `beelot-webhook-resolved` (the same URL, the firing and the resolved template),
  `beelot-email` and `beelot-email-resolved` likewise. Each is created only when absent.
- **Alerts** (`packaging/observability/beelot-alerts.json`, a list; `load.sh` fills in destinations and template):
  `beelot-database-down` (as in US-157), `beelot-error-share` (5xx over 5 % of the requests of the last 5 minutes) and
  `beelot-no-telemetry` (`absent_over_time` of the database gauge over 10 minutes).
- **Resolved.** OpenObserve sends nothing when an alert clears, so each alert has a companion `<name>-resolved` that holds for
  a while after the recovery: it is true when the condition held in the last 15 minutes (10 for the telemetry) and no longer
  holds, and its silence is as long as that window, so it sends once. The error share compares the 15-minute and the
  5-minute shares instead of a subquery. Companions are loaded only with a real destination.
- **Idempotence.** An alert, template or destination that exists is left alone, except that an alert still on the placeholder
  destination is moved to the real ones when they are set later (read, change `destinations` and `template`, put back).
- **CI.** `test-observability.sh` adds a listener (a `nc` loop of the compose project's Alpine image, in an override file),
  sets the webhook to it, stops MariaDB and waits up to five minutes for a request that names `beelot-database-down`.
