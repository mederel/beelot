#!/bin/sh
# Loads the "Beelot" dashboard and the database alert into OpenObserve (US-157), once: what exists is left alone, so
# running it again changes nothing. Needs OPENOBSERVE_URL (such as http://openobserve:5080), OPENOBSERVE_ROOT_EMAIL and
# OPENOBSERVE_ROOT_PASSWORD, and curl and jq.
set -eu
dir=$(dirname "$0")
base="${OPENOBSERVE_URL:?}/api/default"
auth="${OPENOBSERVE_ROOT_EMAIL:?}:${OPENOBSERVE_ROOT_PASSWORD:?}"
api() { curl -fsS -u "$auth" -H 'Content-Type: application/json' "$@"; }
# POST a file and show OpenObserve's own answer when it refuses it.
post() {
  code=$(curl -sS -o /tmp/answer -w '%{http_code}' -u "$auth" -H 'Content-Type: application/json' -X POST "$1" --data-binary "@$2")
  case "$code" in 2??) ;; *) echo "OpenObserve refused $2 ($code): $(cat /tmp/answer)" >&2; return 1 ;; esac
}

for _ in $(seq 1 60); do
  curl -fsS "$OPENOBSERVE_URL/healthz" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "$OPENOBSERVE_URL/healthz" >/dev/null

if api "$base/dashboards" | jq -e '.dashboards[]? | select(.title == "Beelot" or .v5.title == "Beelot" or .v3.title == "Beelot" or .v1.title == "Beelot")' >/dev/null; then
  echo "the Beelot dashboard is already there"
else
  post "$base/dashboards" "$dir/beelot-dashboard.json"
  echo "the Beelot dashboard is loaded"
fi

# OpenObserve checks an alert against its stream, which exists once Beelot has sent its first metrics (a few seconds to a
# minute after the start, the export interval being 60 s by default). The dashboard does not depend on it.
stream_seen=no
for _ in $(seq 1 90); do
  if api "$base/streams?type=metrics" | jq -e '.list[]? | select(.name == "beelot_database_up")' >/dev/null; then
    stream_seen=yes
    break
  fi
  sleep 2
done
if [ "$stream_seen" = no ]; then
  echo "no metrics from Beelot after 3 minutes: the database alert is not loaded; check the OTEL_* lines of .env and run this again"
  exit 0
fi

# OpenObserve wants every alert to name a destination: a placeholder that goes nowhere stands in until the operator edits it.
if ! api "$base/alerts/templates" | jq -e '.[]? | select(.name == "beelot")' >/dev/null; then
  post "$base/alerts/templates" "$dir/beelot-template.json"
fi
if ! api "$base/alerts/destinations" | jq -e '.[]? | select(.name == "beelot-to-set")' >/dev/null; then
  post "$base/alerts/destinations" "$dir/beelot-destination.json"
fi

if api "$OPENOBSERVE_URL/api/v2/default/alerts" 2>/dev/null | jq -e '.list[]? | select(.name == "beelot-database-down")' >/dev/null 2>&1 \
  || api "$base/alerts" | jq -e '.list[]? | select(.name == "beelot-database-down")' >/dev/null 2>&1; then
  echo "the database alert is already there"
else
  post "$OPENOBSERVE_URL/api/v2/default/alerts" "$dir/beelot-alert.json"
  echo "the database alert is loaded"
fi
