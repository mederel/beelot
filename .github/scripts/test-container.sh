#!/usr/bin/env bash
# Runs a built Beelot image against a MariaDB container and checks it (US-135): it runs as a non-root user, refuses to
# start without the privacy settings and says which are missing, then starts and answers /api/version, /api/health (also as
# the image's own HEALTHCHECK asks it), the page and the privacy policy. Then it starts the image against an OpenTelemetry
# collector and checks the logs arrive, without the fields of the event (US-154), and the request metrics (US-155).
#
# Usage: test-container.sh IMAGE   (needs Docker and curl)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 IMAGE" >&2
  exit 2
fi
image=$1
suffix=$$
network=beelot-test-$suffix
db=beelot-test-db-$suffix
app=beelot-test-app-$suffix
collector=beelot-test-collector-$suffix
port=18080

fail() {
  echo "test-container: $*" >&2
  docker logs "$app" 2>&1 | tail -20 >&2 || true
  exit 1
}
cleanup() {
  docker rm -f "$app" "$app-otel" "$collector" "$db" > /dev/null 2>&1 || true
  rm -rf "${collector_dir:-}"
  docker network rm "$network" > /dev/null 2>&1 || true
}
trap cleanup EXIT

[ "$(docker inspect -f '{{.Config.User}}' "$image")" = "10001:10001" ] || fail "the image does not run as 10001:10001"

docker network create "$network" > /dev/null
docker run -d --name "$db" --network "$network" \
  -e MARIADB_DATABASE=beelot -e MARIADB_USER=beelot -e MARIADB_PASSWORD=test-password \
  -e MARIADB_RANDOM_ROOT_PASSWORD=yes mariadb:12.3 > /dev/null
for _ in $(seq 1 60); do
  if docker exec "$db" healthcheck.sh --connect --innodb_initialized > /dev/null 2>&1; then break; fi
  sleep 2
done
docker exec "$db" healthcheck.sh --connect --innodb_initialized > /dev/null 2>&1 || fail "MariaDB did not start"

database=(-e BEELOT_DATABASE_URL="mysql://$db:3306/beelot" -e BEELOT_DATABASE_USERNAME=beelot -e BEELOT_DATABASE_PASSWORD=test-password)

# Without the privacy settings it must stop, naming what is missing.
if docker run --name "$app" --network "$network" "${database[@]}" "$image" > /dev/null 2>&1; then
  fail "the server started without the privacy settings"
fi
# Read the log whole before grepping: with pipefail, `grep -q` closing the pipe early can make `docker logs` fail.
refusal_log=$(docker logs "$app" 2>&1)
grep -q 'BEELOT_PRIVACY_CONTROLLER' <<< "$refusal_log" || fail "the refusal does not name the missing setting"
docker rm -f "$app" > /dev/null

docker run -d --name "$app" --network "$network" -p "127.0.0.1:$port:8080" "${database[@]}" \
  -e BEELOT_PUBLIC_URL="http://localhost:$port" \
  -e BEELOT_PRIVACY_CONTROLLER="Test controller" -e BEELOT_PRIVACY_CONTACT=privacy@example.invalid \
  -e BEELOT_HOSTING_PROVIDER="Test host" -e BEELOT_HOSTING_DPA="Test DPA" -e BEELOT_BACKUP_RETENTION_DAYS=14 \
  -e BEELOT_IP_TOKEN_SECRET=test-secret-0123456789 "$image" > /dev/null

ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/version" > /dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
$ready || fail "/api/version did not answer"
# The health route (US-151), asked as a client would and as the image's own HEALTHCHECK asks it.
health=$(curl -fsS "http://127.0.0.1:$port/api/health") || fail "/api/health did not answer ok"
[ "$health" = '{"status":"ok"}' ] || fail "/api/health answered something else: $health"
script=$(docker inspect -f '{{index .Config.Healthcheck.Test 3}}' "$image")
grep -q '/api/health' <<< "$script" || fail "the image's HEALTHCHECK does not use /api/health"
docker exec "$app" bash -c "$script" || fail "the image's HEALTHCHECK command failed"
# Read each body whole before grepping: with pipefail, `grep -q` closing the pipe early makes curl fail (exit 23).
page=$(curl -fsS "http://127.0.0.1:$port/") || fail "the page did not answer"
grep -qi 'beelot' <<< "$page" || fail "the page is not served"
policy=$(curl -fsS "http://127.0.0.1:$port/privacy-policy.json") || fail "the privacy policy did not answer"
grep -q '"version"' <<< "$policy" || fail "the privacy policy is not served"
[ "$(docker exec "$app" id -u)" = 10001 ] || fail "the server does not run as 10001"

# The logs (US-154): a collector that prints what it receives, and the server stopped the way a service manager stops it,
# which sends the pending records.
collector_dir=$(mktemp -d)
cat > "$collector_dir/config.yaml" <<'YAML'
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  debug:
    verbosity: detailed
service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
YAML
chmod 755 "$collector_dir" && chmod 644 "$collector_dir/config.yaml"
docker run -d --name "$collector" --network "$network" -v "$collector_dir/config.yaml:/etc/otelcol/config.yaml:ro" \
  otel/opentelemetry-collector:latest --config /etc/otelcol/config.yaml > /dev/null
docker run -d --name "$app-otel" --network "$network" -p "127.0.0.1:$((port + 1)):8080" "${database[@]}" \
  -e BEELOT_PUBLIC_URL="http://localhost:$((port + 1))" \
  -e BEELOT_PRIVACY_CONTROLLER="Test controller" -e BEELOT_PRIVACY_CONTACT=privacy@example.invalid \
  -e BEELOT_HOSTING_PROVIDER="Test host" -e BEELOT_HOSTING_DPA="Test DPA" -e BEELOT_BACKUP_RETENTION_DAYS=14 \
  -e BEELOT_IP_TOKEN_SECRET=test-secret-0123456789 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT="http://$collector:4318" -e OTEL_SERVICE_NAME=beelot-ci "$image" > /dev/null
ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$((port + 1))/api/version" > /dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
$ready || { app="$app-otel"; fail "the server with the collector did not answer"; }
docker stop -t 15 "$app-otel" > /dev/null
received=$(docker logs "$collector" 2>&1)
grep -q 'service.name: Str(beelot-ci)' <<< "$received" || { echo "$received" | tail -30 >&2; fail "the collector received no log of beelot-ci"; }
grep -q 'listening' <<< "$received" || fail "the collector did not receive the listening message"
grep -q 'SeverityText: INFO' <<< "$received" || fail "the severity is not on the record"
# The event carries its address as a field: it must not leave the server.
if grep -q '0.0.0.0:8080' <<< "$received"; then fail "a field of the event reached the collector"; fi
# The metrics (US-155): the request duration arrives with the route template, the method and the status. The pending
# metrics are sent when the server stops, so the default one-minute interval does not matter.
grep -q 'http.server.request.duration' <<< "$received" || { echo "$received" | tail -40 >&2; fail "the collector received no request duration"; }
grep -q 'http.route: Str(/api/version)' <<< "$received" || fail "the request duration has no route template"
grep -q 'http.response.status_code: Int(200)' <<< "$received" || fail "the request duration has no status"
# A bad endpoint stops the start and names the variable.
if refusal=$(docker run --rm --network "$network" "${database[@]}" -e OTEL_EXPORTER_OTLP_ENDPOINT=collector "$image" 2>&1); then
  fail "the server started with a bad OpenTelemetry endpoint"
fi
grep -q 'OTEL_EXPORTER_OTLP_ENDPOINT' <<< "$refusal" || fail "the refusal does not name the variable"

echo "ok"
