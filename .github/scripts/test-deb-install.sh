#!/usr/bin/env bash
# Installs a built Beelot .deb on a clean Debian and checks the result: the user,
# the settings file's mode, the libraries, the unit, that an edited settings file
# survives a reinstall, and that purging keeps the user.
#
# Usage: test-deb-install.sh DEB   (run it as root in a debian:stable or debian:testing container)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [ "$#" -ne 1 ]; then
  echo "usage: $0 DEB" >&2
  exit 2
fi
deb=$(readlink -f "$1")

fail() {
  echo "test-deb-install: $*" >&2
  exit 1
}

apt-get update -qq > /dev/null
apt-get install -y -qq systemd > /dev/null
(dpkg -i "$deb" || apt-get -f install -y -qq) > /dev/null 2>&1
dpkg -s beelot | grep -q 'Status: install ok installed' || fail "beelot is not installed"

getent passwd beelot > /dev/null || fail "the beelot user was not created"
env_file=/etc/beelot/beelot.env
[ "$(stat -c '%a %U:%G' "$env_file")" = "640 root:beelot" ] || fail "$env_file is not 640 root:beelot"
if ldd /usr/bin/beelot-server | grep -q 'not found'; then
  fail "a library of beelot-server is missing"
fi
systemd-analyze verify /usr/lib/systemd/system/beelot.service || fail "the unit does not verify"
# The backup (US-153): its units verify, nothing enables the timer, and its directory is for root and the group only.
for unit in beelot-backup.service beelot-backup.timer; do
  systemd-analyze verify "/usr/lib/systemd/system/$unit" || fail "$unit does not verify"
done
if find /etc/systemd/system -name 'beelot-backup*' | grep -q .; then
  fail "the install enabled the backup timer"
fi
[ "$(stat -c '%a %U:%G' /var/backups/beelot)" = "750 root:beelot" ] || fail "/var/backups/beelot is not 750 root:beelot"

# An edit to the settings survives a reinstall, and keeps its mode.
echo 'BEELOT_DATABASE_PASSWORD=edited' >> "$env_file"
dpkg -i "$deb" > /dev/null 2>&1
grep -q '^BEELOT_DATABASE_PASSWORD=edited$' "$env_file" || fail "the edited settings were overwritten"
[ "$(stat -c '%a %U:%G' "$env_file")" = "640 root:beelot" ] || fail "the settings lost their mode"

# Purging removes the settings, never the user or the backups.
touch /var/backups/beelot/beelot-19700101T000000Z.sql.gz
dpkg --purge beelot > /dev/null 2>&1
[ ! -e /etc/beelot ] || fail "purge left /etc/beelot"
[ -e /var/backups/beelot/beelot-19700101T000000Z.sql.gz ] || fail "purge removed the backups"
getent passwd beelot > /dev/null || fail "purge removed the beelot user"

echo "ok"
