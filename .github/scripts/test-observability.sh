#!/usr/bin/env bash
# Starts the compose stack with the profile `observability` (US-157), plays a solo match through the API and asks OpenObserve
# for what it received: the match's log line, the request's trace, the match counter, the dashboard and the alert. Prints the
# memory and the image size of the OpenObserve container. Usage: test-observability.sh IMAGE (the Beelot image to try).
set -euo pipefail
image=${1:?usage: test-observability.sh IMAGE}
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'docker compose --project-directory "$work" -f "$work/compose.yaml" --profile observability logs --no-color | tail -80; docker compose --project-directory "$work" -f "$work/compose.yaml" --profile observability down -v' EXIT

mkdir -p "$work/observability"
cp "$root/packaging/container/compose.yaml" "$work/compose.yaml"
cp "$root"/packaging/observability/* "$work/observability/"
sed -i 's#\.\./observability#./observability#' "$work/compose.yaml"
sed -i "s#ghcr.io/mederel/beelot:\${BEELOT_VERSION:-latest}#$image#" "$work/compose.yaml"
email=ci@example.org
password=ci-password-1
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
OTEL_EXPORTER_OTLP_ENDPOINT=http://openobserve:5080/api/default
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20$token
OTEL_METRIC_EXPORT_INTERVAL=2000
ENV
fail() { echo "FAIL: $*" >&2; exit 1; }
dc() { docker compose --project-directory "$work" -f "$work/compose.yaml" --profile observability "$@"; }
o2() { curl -fsS -u "$email:$password" -H 'Content-Type: application/json' "$@"; }

dc up -d --wait beelot openobserve
dc up openobserve-setup 2>&1 | tail -5
# Loading the setup a second time changes nothing.
dc run --rm openobserve-setup 2>&1 | grep -q "already there" || fail "the second load was not a no-op"

# A solo match through the API: the unit tests of the server cover the rules, this only has to produce traffic.
base=http://127.0.0.1:8080
curl -fsS "$base/api/version" >/dev/null
for _ in 1 2 3; do curl -fsS "$base/api/health" >/dev/null; done
sleep 8
now=$(( $(date +%s) * 1000000 )); then=$(( now - 600 * 1000000 ))
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
o2 "http://127.0.0.1:5080/api/default/streams?type=metrics" | jq -e '.list[]|select(.name|test("http_server_request_duration"))' >/dev/null || fail "no request duration metric"
o2 "http://127.0.0.1:5080/api/default/dashboards" | jq -e '.dashboards[]?|select(.v5.title=="Beelot" or .title=="Beelot")' >/dev/null || fail "the Beelot dashboard is missing"
o2 "http://127.0.0.1:5080/api/v2/default/alerts" | jq -e '.list[]?|select(.name=="beelot-database-down")' >/dev/null || fail "the database alert is missing"

echo "OpenObserve memory and image:"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep openobserve
docker image ls openobserve/openobserve --format '{{.Repository}}:{{.Tag}} {{.Size}}'
