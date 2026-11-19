#!/bin/sh
# Loads the "Beelot" dashboard, the alerts and their destinations into OpenObserve (US-157, US-159, US-161): what exists is
# left alone, so running it again changes nothing. An alert needs the metric stream it watches, and a stream exists only
# once Beelot has sent that metric (the request metric, after the first request: minutes or days after a fresh install), so
# the script stays up and looks again every OPENOBSERVE_SETUP_INTERVAL seconds (30 by default) until every alert is loaded,
# then ends. Needs OPENOBSERVE_URL (such as http://openobserve:5080),
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
interval="${OPENOBSERVE_SETUP_INTERVAL:-30}"
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

# The link of the messages: the dashboard itself when its identifier is known, the list of dashboards otherwise.
dashboard_id=$(api "$base/dashboards" | jq -r '[.dashboards[]? | select(.title == "Beelot" or .v5.title == "Beelot" or .v3.title == "Beelot" or .v1.title == "Beelot") | (.v5.dashboardId // .v3.dashboardId // .v1.dashboardId // .dashboardId // .dashboard_id // empty)][0] // empty')
if [ -n "$dashboard_id" ]; then
  link="$public/web/dashboards/view?dashboard=$dashboard_id&folder=default"
else
  link="$public/web/dashboards"
fi
# The message holds the alert's name, its state and the link, nothing else: no log line, no value of a player.
message() { printf 'Beelot: {alert_name} is %s. Dashboard: %s' "$1" "$link"; }

# ensure KIND NAME JSON: create a template or a destination only when it is absent.
ensure() {
  if api "$base/alerts/$1" | jq -e --arg n "$2" '.[]? | select(.name == $n)' >/dev/null; then return 0; fi
  printf '%s' "$3" >/tmp/new.json
  post "$base/alerts/$1" /tmp/new.json
  echo "the $2 ${1%s} is loaded"
}

firing='[]'
resolved='[]'
# The template of the alert itself is left empty when a destination is real: OpenObserve applies an alert's template to every
# destination (an email would carry the webhook's JSON), whereas without it each destination uses its own.
template=
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
fi
if [ -n "$email" ] && [ -z "${OPENOBSERVE_SMTP_HOST:-}" ]; then
  echo "OPENOBSERVE_ALERT_EMAIL is set without OPENOBSERVE_SMTP_HOST: no email destination is created"
elif [ -n "$email" ]; then
  # OpenObserve only mails its own users, and its open-source edition has one role to give: admin. The recipient becomes an
  # admin of the organisation with a random password nobody knows (the operator resets it as root to let them sign in).
  if ! api "$base/users" | jq -e --arg e "$email" '.data[]? | select(.email == $e)' >/dev/null; then
    secret=$(head -c 24 /dev/urandom | base64 | tr -d '/+=\n')A1!
    jq -cn --arg e "$email" --arg p "$secret" '{email: $e, password: $p, first_name: "Beelot", last_name: "Alerts", role: "admin"}' >/tmp/user.json
    post "$base/users" /tmp/user.json
    rm -f /tmp/user.json
    echo "the alert recipient $email is created as a user of OpenObserve"
  fi
  for state in firing resolved; do
    upper=$(printf '%s' "$state" | tr a-z A-Z)
    ensure templates "beelot-email-$state" "$(jq -cn --arg n "beelot-email-$state" --arg t "Beelot: {alert_name} is $upper" --arg b "$(message "$upper")" '{name: $n, type: "email", title: $t, body: $b, isDefault: false}')"
    name=beelot-email
    [ "$state" = resolved ] && name=beelot-email-resolved
    ensure destinations "$name" "$(jq -cn --arg n "$name" --arg e "$email" --arg t "beelot-email-$state" '{name: $n, type: "email", emails: [$e], template: $t}')"
    if [ "$state" = firing ]; then firing=$(printf '%s' "$firing" | jq -c --arg d "$name" '. + [$d]'); else resolved=$(printf '%s' "$resolved" | jq -c --arg d "$name" '. + [$d]'); fi
  done
fi
if [ "$firing" = '[]' ]; then
  # OpenObserve wants every alert to name a destination: a placeholder that goes nowhere stands in until the operator sets one.
  template=beelot
  ensure templates beelot "$(cat "$dir/beelot-template.json")"
  ensure destinations beelot-to-set "$(cat "$dir/beelot-destination.json")"
  firing='["beelot-to-set"]'
  real=no
else
  real=yes
fi

alert_id() { api "$v2/alerts" | jq -r --arg n "$1" '.list[]? | select(.name == $n) | .alert_id // .id // empty'; }

# One pass over the alerts: loads what can be loaded now, counts in `pending` the alerts whose stream does not exist yet and
# lists them in `waiting`.
pending=0
waiting=
load_alerts() {
  pending=0
  waiting=
  count=$(jq length "$dir/beelot-alerts.json")
  i=0
  while [ "$i" -lt "$count" ]; do
    name=$(jq -r ".[$i].name" "$dir/beelot-alerts.json")
    kind=$(jq -r ".[$i].kind" "$dir/beelot-alerts.json")
    stream=$(jq -r ".[$i].stream_name" "$dir/beelot-alerts.json")
    stream_type=$(jq -r ".[$i].stream_type" "$dir/beelot-alerts.json")
    dests=$firing
    [ "$kind" = resolved ] && dests=$resolved
    index=$i
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
    # OpenObserve checks an alert against its stream, which exists once Beelot has sent that metric: the request metric
    # waits for the first request, so the alert is left for the next pass instead of waiting here.
    if ! api "$base/streams?type=$stream_type" | jq -e --arg n "$stream" '.list[]? | select(.name == $n)' >/dev/null; then
      pending=$((pending + 1))
      waiting="$waiting $name"
      continue
    fi
    tmpl=$template
    [ "$kind" = resolved ] && tmpl=$(printf '%s' "$template" | sed 's/-firing$/-resolved/')
    jq ".[$index] | del(.kind) | .destinations = $dests | .template = \"$tmpl\"" "$dir/beelot-alerts.json" >/tmp/alert.json
    post "$v2/alerts" /tmp/alert.json
    echo "the alert $name is loaded"
  done
}

# Looks again after each wait. The log says what is awaited when that changes and every ten minutes otherwise, never at each look.
last=
looks=0
while :; do
  load_alerts
  [ "$pending" -eq 0 ] && break
  if [ "$waiting" != "$last" ] || [ $((looks % 20)) -eq 0 ]; then
    echo "waiting for the metrics of Beelot, which appear with its first request or export: not loaded yet:$waiting (looking again every ${interval} s)"
  fi
  last=$waiting
  looks=$((looks + 1))
  sleep "$interval"
done
echo "all the alerts are loaded"
