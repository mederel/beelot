#!/usr/bin/env bash
# Runs a built Beelot image against a MariaDB container and checks it (US-135): it runs as a non-root user, refuses to
# start without the privacy settings and says which are missing, then starts and answers /api/version, the page and the
# privacy policy.
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
port=18080

fail() {
  echo "test-container: $*" >&2
  docker logs "$app" 2>&1 | tail -20 >&2 || true
  exit 1
}
cleanup() {
  docker rm -f "$app" "$db" > /dev/null 2>&1 || true
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
docker logs "$app" 2>&1 | grep -q 'BEELOT_PRIVACY_CONTROLLER' || fail "the refusal does not name the missing setting"
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
curl -fsS "http://127.0.0.1:$port/" | grep -qi 'beelot' || fail "the page is not served"
curl -fsS "http://127.0.0.1:$port/privacy-policy.json" | grep -q '"version"' || fail "the privacy policy is not served"
[ "$(docker exec "$app" id -u)" = 10001 ] || fail "the server does not run as 10001"

echo "ok"
