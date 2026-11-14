#!/bin/sh
# Loads the "Beelot" dashboard and the database alert into OpenObserve (US-157), once: what exists is left alone, so
# running it again changes nothing. Needs OPENOBSERVE_URL (such as http://openobserve:5080), OPENOBSERVE_ROOT_EMAIL and
# OPENOBSERVE_ROOT_PASSWORD, and curl and jq.
set -eu
dir=$(dirname "$0")
base="${OPENOBSERVE_URL:?}/api/default"
auth="${OPENOBSERVE_ROOT_EMAIL:?}:${OPENOBSERVE_ROOT_PASSWORD:?}"
api() { curl -fsS -u "$auth" -H 'Content-Type: application/json' "$@"; }

for _ in $(seq 1 60); do
  curl -fsS "$OPENOBSERVE_URL/healthz" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "$OPENOBSERVE_URL/healthz" >/dev/null

if api "$base/dashboards" | jq -e '.dashboards[]? | select(.title == "Beelot" or .v5.title == "Beelot" or .v3.title == "Beelot" or .v1.title == "Beelot")' >/dev/null; then
  echo "the Beelot dashboard is already there"
else
  api -X POST "$base/dashboards" --data-binary "@$dir/beelot-dashboard.json" >/dev/null
  echo "the Beelot dashboard is loaded"
fi

if api "$base/v2/alerts" 2>/dev/null | jq -e '.list[]? | select(.name == "beelot-database-down")' >/dev/null 2>&1 \
  || api "$base/alerts" | jq -e '.list[]? | select(.name == "beelot-database-down")' >/dev/null 2>&1; then
  echo "the database alert is already there"
else
  api -X POST "$base/v2/alerts" --data-binary "@$dir/beelot-alert.json" >/dev/null
  echo "the database alert is loaded"
fi
