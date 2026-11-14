#!/usr/bin/env bash
# Tries the backup procedure of US-153 against real MariaDB containers, so it is tried and not only written: a database
# holding a played match is dumped with packaging/backup/beelot-backup and restored into a fresh one, and the match is read
# back. It also checks the owner and mode of the file, that only the newest copies stay, and that a failed dump leaves no file.
#
# Usage: test-backup.sh   (from the repository root; needs Docker)
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
image=mariadb:12.3
suffix=$$
network=beelot-backup-$suffix
source_db=beelot-backup-source-$suffix
fresh_db=beelot-backup-fresh-$suffix
work=$(mktemp -d)
password=test-password

fail() {
  echo "test-backup: $*" >&2
  exit 1
}
cleanup() {
  docker rm -f "$source_db" "$fresh_db" > /dev/null 2>&1 || true
  docker network rm "$network" > /dev/null 2>&1 || true
  # The files are root's, written from a container.
  docker run --rm -v "$work":/work --entrypoint rm "$image" -rf /work/backups /work/beelot.env > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

start_db() {
  docker run -d --name "$1" --network "$network" \
    -e MARIADB_DATABASE=beelot -e MARIADB_USER=beelot -e MARIADB_PASSWORD="$password" \
    -e MARIADB_RANDOM_ROOT_PASSWORD=yes "$image" > /dev/null
}
wait_db() {
  for _ in $(seq 1 60); do
    if docker exec "$1" healthcheck.sh --connect --innodb_initialized > /dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "MariaDB $1 did not start"
}
sql() { docker exec -i "$1" mariadb --skip-ssl -ubeelot -p"$password" beelot "${@:2}"; }

docker network create "$network" > /dev/null
start_db "$source_db"
start_db "$fresh_db"
wait_db "$source_db"
wait_db "$fresh_db"

# The schema as the server creates it, then a played match: an account, the match and its four seats.
for migration in "$root"/crates/beelot-server/migrations/*.sql; do
  sql "$source_db" < "$migration" || fail "could not apply $migration"
done
account=11111111-1111-4111-8111-111111111111
match=22222222-2222-4222-8222-222222222222
sql "$source_db" <<SQL
INSERT INTO account (id, display_name, created_at, last_sign_in_at)
  VALUES ('$account', 'Ana', '2026-11-14 10:00:00.000000', '2026-11-14 10:00:00.000000');
INSERT INTO match_record (id, ended_at, mode, variant, difficulty, north_south_score, east_west_score, winning_team)
  VALUES ('$match', '2026-11-14 11:00:00.000000', 'PUBLIC', 'CLASSIC', NULL, 1040, 870, 'NORTH_SOUTH');
INSERT INTO match_seat (match_id, position, account_id, name, team, bot) VALUES
  ('$match', 0, '$account', 'Ana', 'NORTH_SOUTH', FALSE),
  ('$match', 1, NULL, 'Bot East', 'EAST_WEST', TRUE),
  ('$match', 2, NULL, 'Bot North', 'NORTH_SOUTH', TRUE),
  ('$match', 3, NULL, 'Bot West', 'EAST_WEST', TRUE);
SQL
[ "$(sql "$source_db" -N -e 'SELECT COUNT(*) FROM match_seat')" = 4 ] || fail "the match was not stored in the source database"
[ "$(sql "$fresh_db" -N -e 'SHOW TABLES' | wc -l)" = 0 ] || fail "the fresh database is not empty"

# The script runs in a container with the MariaDB client, as root, like the service. The settings file has the owner and
# mode of the package's: root, the beelot group, 0640. The backups must follow them.
cat > "$work/beelot.env" <<ENV
BEELOT_DATABASE_URL=mysql://$source_db:3306/beelot
BEELOT_DATABASE_USERNAME=beelot
BEELOT_DATABASE_PASSWORD=$password
BEELOT_BACKUP_DIR=/work/backups
BEELOT_BACKUP_KEEP=2
BEELOT_BACKUP_CLIENT_OPTIONS=--skip-ssl
ENV
backup() {
  docker run --rm --network "$network" -v "$work":/work -v "$root/packaging/backup/beelot-backup":/usr/bin/beelot-backup:ro \
    -e BEELOT_SETTINGS_FILE=/work/beelot.env --entrypoint bash "$image" -c \
    'getent group beelot > /dev/null || groupadd -r beelot
     chown root:beelot /work/beelot.env && chmod 0640 /work/beelot.env
     exec beelot-backup "$@"' backup "$@"
}

for _ in 1 2 3; do
  backup > /dev/null || fail "the dump failed"
  sleep 1 # the file name has a one-second resolution
done
# The group is created here too, so that stat prints its name and not its number.
files=$(docker run --rm -v "$work":/work --entrypoint bash "$image" -c \
  'getent group beelot > /dev/null || groupadd -r beelot
   cd /work/backups && ls -1 beelot-*.sql.gz && stat -c "%a %U:%G %n" /work/backups beelot-*.sql.gz')
[ "$(grep -c '^beelot-' <<< "$files")" = 2 ] || fail "three dumps with BEELOT_BACKUP_KEEP=2 did not leave two copies: $files"
grep -q '^750 root:beelot /work/backups$' <<< "$files" || fail "the backup directory is not 750 root:beelot: $files"
[ "$(grep -c '^640 root:beelot beelot-' <<< "$files")" = 2 ] || fail "a backup is not 640 root:beelot, the settings file's owner and mode: $files"

# A failed dump (wrong password) writes nothing and removes nothing.
if docker run --rm --network "$network" -v "$work":/work -v "$root/packaging/backup/beelot-backup":/usr/bin/beelot-backup:ro \
  -e BEELOT_SETTINGS_FILE=/work/beelot.env -e BEELOT_DATABASE_PASSWORD=wrong --entrypoint bash "$image" -c beelot-backup > /dev/null 2>&1; then
  fail "a dump with a wrong password succeeded"
fi
after=$(docker run --rm -v "$work":/work --entrypoint bash "$image" -c 'ls -1 /work/backups')
[ "$after" = "$(grep '^beelot-' <<< "$files")" ] || fail "a failed dump changed the backups: $after"

# Restore the newest copy into the fresh database, through the settings of that database.
newest=$(grep '^beelot-' <<< "$files" | sort | tail -n 1)
docker run --rm --network "$network" -v "$work":/work -v "$root/packaging/backup/beelot-backup":/usr/bin/beelot-backup:ro \
  -e BEELOT_SETTINGS_FILE=/work/beelot.env -e BEELOT_DATABASE_URL="mysql://$fresh_db:3306/beelot" \
  --entrypoint bash "$image" -c "beelot-backup restore /work/backups/$newest" > /dev/null || fail "the restore failed"

result=$(sql "$fresh_db" -N -e "SELECT winning_team, north_south_score, east_west_score FROM match_record WHERE id = '$match'")
[ "$result" = $'NORTH_SOUTH\t1040\t870' ] || fail "the restored match is wrong or missing: '$result'"
[ "$(sql "$fresh_db" -N -e "SELECT COUNT(*) FROM match_seat WHERE match_id = '$match'")" = 4 ] || fail "the restored match lacks its seats"
[ "$(sql "$fresh_db" -N -e "SELECT display_name FROM account WHERE id = '$account'")" = Ana ] || fail "the restored account is missing"
# The seat of the signed-in player still points at the account: the foreign keys came back too.
[ "$(sql "$fresh_db" -N -e "SELECT account_id FROM match_seat WHERE match_id = '$match' AND position = 0")" = "$account" ] \
  || fail "the restored seat lost its account"

echo "ok"
