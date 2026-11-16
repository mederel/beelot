#!/bin/sh
# Loads the "Beelot" dashboard, the alerts and their destinations into OpenObserve (US-157, US-159), once: what exists is
# left alone, so running it again changes nothing. Needs OPENOBSERVE_URL (such as http://openobserve:5080),
# OPENOBSERVE_ROOT_EMAIL and OPENOBSERVE_ROOT_PASSWORD, and curl and jq. Optional: OPENOBSERVE_ALERT_WEBHOOK_URL (and
# OPENOBSERVE_ALERT_WEBHOOK_FORMAT, json or text), OPENOBSERVE_ALERT_EMAIL (which needs OPENOBSERVE_SMTP_HOST), and
# OPENOBSERVE_PUBLIC_URL, the address of the web interface for the link in the messages.
set -eu
dir=$(dirname "$0")
base="${OPENOBSERVE_URL:?}/api/default"
auth="${OPENOBSERVE_ROOT_EMAIL:?}:${OPENOBSERVE_ROOT_PASSWORD:?}"
v2="$OPENOBSERVE_URL/api/v2/default"
public="${OPENOBSERVE_PUBLIC_URL:-http://127.0.0.1:5080}"
public="${public%/}"
webhook="${OPENOBSERVE_ALERT_WEBHOOK_URL:-}"
format="${OPENOBSERVE_ALERT_WEBHOOK_FORMAT:-json}"
email="${OPENOBSERVE_ALERT_EMAIL:-}"
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

# The link of the messages: the dashboard itself when its identifier is known, the list of dashboards otherwise.
dashboard_id=$(api "$base/dashboards" | jq -r '[.dashboards[]? | select(.title == "Beelot" or .v5.title == "Beelot" or .v3.title == "Beelot" or .v1.title == "Beelot") | (.v5.dashboardId // .v3.dashboardId // .v1.dashboardId // .dashboardId // .dashboard_id // empty)][0] // empty')
if [ -n "$dashboard_id" ]; then
  link="$public/web/dashboards/view?dashboard=$dashboard_id&folder=default"
else
  link="$public/web/dashboards"
fi
# The message holds the alert's name, its state, the time and the link, nothing else: no log line, no value of a player.
message() { printf 'Beelot: {alert_name} is %s at {timestamp}. Dashboard: %s' "$1" "$link"; }

# ensure KIND NAME JSON: create a template or a destination only when it is absent.
ensure() {
  if api "$base/alerts/$1" | jq -e --arg n "$2" '.[]? | select(.name == $n)' >/dev/null; then return 0; fi
  printf '%s' "$3" >/tmp/new.json
  post "$base/alerts/$1" /tmp/new.json
  echo "the $2 ${1%s} is loaded"
}

firing='[]'
resolved='[]'
template=beelot
if [ -n "$webhook" ]; then
  for state in firing resolved; do
    upper=$(printf '%s' "$state" | tr a-z A-Z)
    if [ "$format" = text ]; then
      body=$(message "$upper")
      headers='{"Content-Type":"text/plain"}'
    else
      body=$(jq -cn --arg m "$(message "$upper")" '{text: $m, content: $m}')
      headers='{}'
    fi
    ensure templates "beelot-webhook-$state" "$(jq -cn --arg n "beelot-webhook-$state" --arg b "$body" '{name: $n, body: $b, isDefault: false, type: "http"}')"
    name=beelot-webhook
    [ "$state" = resolved ] && name=beelot-webhook-resolved
    ensure destinations "$name" "$(jq -cn --arg n "$name" --arg u "$webhook" --arg t "beelot-webhook-$state" --argjson h "$headers" '{name: $n, url: $u, method: "post", skip_tls_verify: false, headers: $h, template: $t, type: "http"}')"
    if [ "$state" = firing ]; then firing=$(printf '%s' "$firing" | jq -c --arg d "$name" '. + [$d]'); else resolved=$(printf '%s' "$resolved" | jq -c --arg d "$name" '. + [$d]'); fi
  done
  template=beelot-webhook-firing
fi
if [ -n "$email" ] && [ -z "${OPENOBSERVE_SMTP_HOST:-}" ]; then
  echo "OPENOBSERVE_ALERT_EMAIL is set without OPENOBSERVE_SMTP_HOST: no email destination is created"
elif [ -n "$email" ]; then
  for state in firing resolved; do
    upper=$(printf '%s' "$state" | tr a-z A-Z)
    ensure templates "beelot-email-$state" "$(jq -cn --arg n "beelot-email-$state" --arg t "Beelot: {alert_name} is $upper" --arg b "$(message "$upper")" '{name: $n, type: "email", title: $t, body: $b, isDefault: false}')"
    name=beelot-email
    [ "$state" = resolved ] && name=beelot-email-resolved
    ensure destinations "$name" "$(jq -cn --arg n "$name" --arg e "$email" --arg t "beelot-email-$state" '{name: $n, type: "email", emails: [$e], template: $t}')"
    if [ "$state" = firing ]; then firing=$(printf '%s' "$firing" | jq -c --arg d "$name" '. + [$d]'); else resolved=$(printf '%s' "$resolved" | jq -c --arg d "$name" '. + [$d]'); fi
  done
  [ "$template" = beelot ] && template=beelot-email-firing
fi
if [ "$firing" = '[]' ]; then
  # OpenObserve wants every alert to name a destination: a placeholder that goes nowhere stands in until the operator sets one.
  ensure templates beelot "$(cat "$dir/beelot-template.json")"
  ensure destinations beelot-to-set "$(cat "$dir/beelot-destination.json")"
  firing='["beelot-to-set"]'
  real=no
else
  real=yes
fi

alert_id() { api "$v2/alerts" | jq -r --arg n "$1" '.list[]? | select(.name == $n) | .alert_id // .id // empty'; }

count=$(jq length "$dir/beelot-alerts.json")
i=0
while [ "$i" -lt "$count" ]; do
  name=$(jq -r ".[$i].name" "$dir/beelot-alerts.json")
  kind=$(jq -r ".[$i].kind" "$dir/beelot-alerts.json")
  stream=$(jq -r ".[$i].stream_name" "$dir/beelot-alerts.json")
  stream_type=$(jq -r ".[$i].stream_type" "$dir/beelot-alerts.json")
  dests=$firing
  [ "$kind" = resolved ] && dests=$resolved
  i=$((i + 1))
  # The message of a recovery needs a real destination.
  if [ "$kind" = resolved ] && [ "$real" = no ]; then continue; fi
  id=$(alert_id "$name")
  if [ -n "$id" ]; then
    # Moved from the placeholder once the operator sets a destination.
    if [ "$real" = yes ] && api "$v2/alerts/$id" | jq -e '.destinations | index("beelot-to-set")' >/dev/null; then
      tmpl=$template
      [ "$kind" = resolved ] && tmpl=$(printf '%s' "$template" | sed 's/-firing$/-resolved/')
      api "$v2/alerts/$id" | jq --argjson d "$dests" --arg t "$tmpl" '.destinations = $d | .template = $t' >/tmp/alert.json
      code=$(curl -sS -o /tmp/answer -w '%{http_code}' -u "$auth" -H 'Content-Type: application/json' -X PUT "$v2/alerts/$id" --data-binary @/tmp/alert.json)
      case "$code" in 2??) echo "the alert $name is moved to the destinations" ;; *) echo "OpenObserve refused the move of $name ($code): $(cat /tmp/answer)" >&2; exit 1 ;; esac
    else
      echo "the alert $name is already there"
    fi
    continue
  fi
  # OpenObserve checks an alert against its stream, which exists once Beelot has sent its first data (a few seconds to a
  # minute after the start, the export interval being 60 s by default). The dashboard does not depend on it.
  seen=no
  for _ in $(seq 1 90); do
    if api "$base/streams?type=$stream_type" | jq -e --arg n "$stream" '.list[]? | select(.name == $n)' >/dev/null; then seen=yes; break; fi
    sleep 2
  done
  if [ "$seen" = no ]; then
    echo "no $stream from Beelot after 3 minutes: the alert $name is not loaded; check the OTEL_* lines of .env and run this again"
    continue
  fi
  tmpl=$template
  [ "$kind" = resolved ] && tmpl=$(printf '%s' "$template" | sed 's/-firing$/-resolved/')
  jq ".[$((i - 1))] | del(.kind) | .destinations = $dests | .template = \"$tmpl\"" "$dir/beelot-alerts.json" >/tmp/alert.json
  post "$v2/alerts" /tmp/alert.json
  echo "the alert $name is loaded"
done
