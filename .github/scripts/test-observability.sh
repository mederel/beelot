#!/usr/bin/env bash
# Starts the compose stack with the profile `observability` (US-157), plays a solo match through the API and asks OpenObserve
# for what it received: the match's log line, the request's trace, the match counter, the dashboard and the alert. Prints the
# memory and the image size of the OpenObserve container. The setup service starts before any request, as on a fresh install, and
# must load every alert once the request metric exists, however late that is (US-161). Then stops the database and waits for the
# alert to reach a webhook (US-159). Usage: test-observability.sh IMAGE (the Beelot image to try).
set -euo pipefail
image=${1:?usage: test-observability.sh IMAGE}
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'dc logs --no-color | tail -80; dc down -v' EXIT

mkdir -p "$work/observability"
cp "$root/packaging/container/compose.yaml" "$work/compose.yaml"
cp "$root"/packaging/observability/* "$work/observability/"
sed -i 's#\.\./observability#./observability#' "$work/compose.yaml"
sed -i "s#ghcr.io/mederel/beelot:\${BEELOT_VERSION:-latest}#$image#" "$work/compose.yaml"
email=ci@example.org
password='Ci-password-1!'
token=$(printf '%s' "$email:$password" | base64 -w0)
cat > "$work/.env" <<ENV
BEELOT_DATABASE_PASSWORD=ci-database-password
BEELOT_PRIVACY_CONTROLLER=CI
BEELOT_PRIVACY_CONTACT=ci@example.org
BEELOT_HOSTING_PROVIDER=CI
BEELOT_HOSTING_DPA=none
BEELOT_BACKUP_RETENTION_DAYS=14
BEELOT_IP_TOKEN_SECRET=0123456789abcdef0123456789abcdef
OPENOBSERVE_ROOT_EMAIL=$email
OPENOBSERVE_ROOT_PASSWORD=$password
OPENOBSERVE_ALERT_WEBHOOK_URL=http://listener:8000/alert
OPENOBSERVE_ALLOW_PRIVATE_DESTINATIONS=true
OPENOBSERVE_ALERT_EMAIL=ops@example.org
OPENOBSERVE_SMTP_ENABLED=true
OPENOBSERVE_SMTP_HOST=mailpit
OPENOBSERVE_SMTP_PORT=1025
OPENOBSERVE_SMTP_FROM=beelot@example.org
OPENOBSERVE_SMTP_ENCRYPTION=off
OTEL_EXPORTER_OTLP_ENDPOINT=http://openobserve:5080/api/default
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20$token
OTEL_METRIC_EXPORT_INTERVAL=2000
BEELOT_BROWSER_TRACES=true
ENV
fail() { echo "FAIL: $*" >&2; exit 1; }
# The listener is a netcat loop of the compose file's Alpine image that answers 200 and keeps every request in /received.
cat > "$work/listener.yaml" <<LISTENER
services:
  listener:
    profiles: [observability]
    image: $(awk '/image: alpine/ {print $2}' "$work/compose.yaml")
    command: ["sh", "-c", "while true; do printf 'HTTP/1.1 200 OK\\r\\nContent-Length: 0\\r\\n\\r\\n' | nc -l -p 8000 >> /received; done"]
  mailpit:
    profiles: [observability]
    image: axllent/mailpit:v1.27
    ports: ["127.0.0.1:8025:8025"]
LISTENER
dc() { docker compose --project-directory "$work" -f "$work/compose.yaml" -f "$work/listener.yaml" --profile observability "$@"; }
o2() { curl -fsS -u "$email:$password" -H 'Content-Type: application/json' "$@"; }

dc up -d --wait beelot openobserve listener mailpit
# The setup stays up and loads the alerts as their streams appear (US-161): it starts before the traffic, as on a fresh install.
dc up -d openobserve-setup
sleep 10
# A solo match through the API: the unit tests of the server cover the rules, this only has to produce traffic.
base=http://127.0.0.1:8080
curl -fsS "$base/api/version" >/dev/null
for _ in 1 2 3; do curl -fsS "$base/api/health" >/dev/null; done
sleep 8
# After the match every alert must be loaded and the setup must have ended on its own: no wait ending in "not loaded".
expected="beelot-database-down beelot-database-down-resolved beelot-error-share beelot-error-share-resolved beelot-no-telemetry beelot-no-telemetry-resolved"
loaded=no
for _ in $(seq 1 24); do
  have=$(o2 "http://127.0.0.1:5080/api/v2/default/alerts" | jq -r '[.list[]?.name] | join(" ")')
  missing=
  for name in $expected; do case " $have " in *" $name "*) ;; *) missing="$missing $name" ;; esac; done
  if [ -z "$missing" ] && dc logs --no-color openobserve-setup | grep -q "all the alerts are loaded"; then loaded=yes; break; fi
  sleep 5
done
dc logs --no-color openobserve-setup | tail -12
[ "$loaded" = yes ] || fail "alerts missing after the match:${missing:- (the setup did not report that all are loaded)}"
# Loading the setup a second time changes nothing (the first one has ended, so the two never run together).
second=$(dc run --rm openobserve-setup 2>&1) || { echo "$second" >&2; fail "the second load failed"; }
echo "$second" | tail -8
[ "$(grep -c "already there" <<< "$second")" -ge 4 ] || fail "the second load was not a no-op"

now=$(( $(date +%s) * 1000000 )); then=$(( now - 1800 * 1000000 ))
search() { # stream_type sql
  o2 -X POST "http://127.0.0.1:5080/api/default/_search?type=$1" \
    -d "{\"query\":{\"sql\":\"$2\",\"start_time\":$then,\"end_time\":$now,\"from\":0,\"size\":5}}"
}
for _ in $(seq 1 12); do
  logs=$(search logs 'SELECT * FROM \"default\" WHERE body LIKE '"'"'%listening%'"'"'' || true)
  [ "$(jq '.hits|length' <<< "${logs:-{\}}" 2>/dev/null || echo 0)" -gt 0 ] && break; sleep 5
done
[ "$(jq '.hits|length' <<< "$logs")" -gt 0 ] || fail "OpenObserve has no log line of the server"
traces=$(search traces 'SELECT * FROM \"default\" WHERE operation_name = '"'"'GET /api/version'"'"'') || fail "no trace search"
[ "$(jq '.hits|length' <<< "$traces")" -gt 0 ] || fail "OpenObserve has no span GET /api/version"
# The spans of the web client carry the kind of client (US-162): one span of each platform goes through the route, as the page
# sends them (a guest needs no CSRF token), and OpenObserve must hold a span of the service beelot-web for each value.
nowms=$(( $(date +%s) * 1000 ))
spans=$(jq -nc --argjson now "$nowms" '{spans: [
  {kind: "fetch", traceId: ("ab" * 16), spanId: ("cd" * 8), method: "GET", route: "/api/version", startMs: $now, endMs: ($now + 5), status: 200, failed: false, platform: "android-app"},
  {kind: "fetch", traceId: ("ef" * 16), spanId: ("01" * 8), method: "GET", route: "/api/version", startMs: $now, endMs: ($now + 5), status: 200, failed: false, platform: "web"}]}')
curl -fsS -o /dev/null -H 'Content-Type: application/json' -d "$spans" "$base/api/telemetry/spans" || fail "the route of the browser spans refused them"
for platform in android-app web; do
  found=0
  for _ in $(seq 1 12); do
    hits=$(search traces 'SELECT * FROM \"default\" WHERE service_name = '"'"'beelot-web'"'"' AND beelot_client_platform = '"'"$platform"'"'' || true)
    found=$(jq '.hits|length' <<< "${hits:-{\}}" 2>/dev/null || echo 0)
    [ "$found" -gt 0 ] && break; sleep 5
  done
  [ "$found" -gt 0 ] || fail "OpenObserve has no span of beelot-web with the platform $platform"
done
o2 "http://127.0.0.1:5080/api/default/streams?type=metrics" | jq -e '.list[]|select(.name|test("http_server_request_duration"))' >/dev/null || fail "no request duration metric"
o2 "http://127.0.0.1:5080/api/default/dashboards" | jq -e '.dashboards[]?|select(.v5.title=="Beelot" or .title=="Beelot")' >/dev/null || fail "the Beelot dashboard is missing"

# The alert reaches the webhook (US-159): stop the database; the alert fires after two minutes without it.
dc stop mariadb
received=no
for _ in $(seq 1 60); do
  if dc exec -T listener cat /received 2>/dev/null | grep -q beelot-database-down; then received=yes; break; fi
  sleep 5
done
if [ "$received" = no ]; then dc exec -T listener cat /received || true; fail "no alert reached the webhook within five minutes"; fi
echo "the alert reached the webhook:"
dc exec -T listener cat /received | tr -d '\r' | grep -E 'beelot|POST' | head -5

# The same alert, by email (a recipient has to be a user of OpenObserve: load.sh creates it).
mailed=no
for _ in $(seq 1 12); do
  if curl -fsS http://127.0.0.1:8025/api/v1/messages | jq -e '.messages[]? | select(.Subject | test("beelot-database-down is FIRING"))' >/dev/null; then mailed=yes; break; fi
  sleep 5
done
[ "$mailed" = yes ] || fail "no alert email reached the mail sink"
echo "the alert reached the mail sink"

echo "OpenObserve memory and image:"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep openobserve
docker image ls openobserve/openobserve --format '{{.Repository}}:{{.Tag}} {{.Size}}'
