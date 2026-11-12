#!/usr/bin/env bash
# Checks a built Beelot .deb: its metadata, its files and modes, its maintainer
# scripts, the service unit and the settings file.
#
# Usage: check-deb.sh DEB VERSION   (needs dpkg-deb; run it on Debian or Ubuntu)
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 DEB VERSION" >&2
  exit 2
fi
deb=$1
version=$2

fail() {
  echo "check-deb: $*" >&2
  exit 1
}

[ -f "$deb" ] || fail "no such file: $deb"

field() { dpkg-deb -f "$deb" "$1"; }

[ "$(field Package)" = beelot ] || fail "Package is not beelot"
[ "$(field Version)" = "$version" ] || fail "Version is $(field Version), expected $version"
[ "$(field Architecture)" = amd64 ] || fail "Architecture is not amd64"
field Recommends | grep -q 'mariadb-server' || fail "mariadb-server is not recommended"
# postinst calls adduser, which a minimal Debian does not install.
field Depends | grep -q 'adduser' || fail "adduser is not a dependency"
if field Depends 2>/dev/null | grep -q 'mariadb'; then
  fail "mariadb must not be a hard dependency"
fi

contents=$(dpkg-deb -c "$deb")
# Prints the mode column of the entry for the given packaged path.
mode_of() { echo "$contents" | awk -v path="$1" '$6 == path { print $1 }'; }

expect_mode() {
  local path=$1 mode=$2 actual
  actual=$(mode_of "$path")
  [ -n "$actual" ] || fail "$path is not packaged"
  [ "$actual" = "$mode" ] || fail "$path has mode $actual, expected $mode"
}
expect_mode ./usr/bin/beelot-server -rwxr-xr-x
expect_mode ./usr/share/beelot/static/index.html -rw-r--r--
expect_mode ./usr/lib/systemd/system/beelot.service -rw-r--r--
expect_mode ./etc/beelot/beelot.env -rw-r-----
expect_mode ./usr/share/doc/beelot/README.md -rw-r--r--
expect_mode ./usr/share/doc/beelot/changelog.Debian.gz -rw-r--r--

# The unit is installed once, where cargo-deb puts it (not also in /lib).
if echo "$contents" | awk '{ print $6 }' | grep -qx './lib/systemd/system/beelot.service'; then
  fail "the unit is packaged twice"
fi

dpkg-deb -I "$deb" conffiles | grep -qx '/etc/beelot/beelot.env' \
  || fail "/etc/beelot/beelot.env is not a conffile"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dpkg-deb -e "$deb" "$work/control"
dpkg-deb -x "$deb" "$work/root"

for script in postinst postrm; do
  [ -x "$work/control/$script" ] || fail "$script is missing or not executable"
  if grep -q '#DEBHELPER#' "$work/control/$script"; then
    fail "$script still holds the #DEBHELPER# token"
  fi
done
grep -q 'adduser' "$work/control/postinst" || fail "postinst does not create the user"
grep -q 'beelot.service' "$work/control/postinst" || fail "postinst does not handle the unit"
# A fresh install must not start a service whose database does not exist yet.
if grep -q 'deb-systemd-invoke start' "$work/control/postinst"; then
  fail "postinst starts the unit"
fi

unit="$work/root/usr/lib/systemd/system/beelot.service"
for line in User=beelot EnvironmentFile=/etc/beelot/beelot.env Restart=on-failure \
  Wants=network-online.target ExecStart=/usr/bin/beelot-server; do
  grep -qx "$line" "$unit" || fail "the unit lacks $line"
done
# The unit is enabled but the database may not exist yet (a reboot before configuring):
# a failing start must give up instead of restarting every few seconds forever.
for line in StartLimitIntervalSec=60 StartLimitBurst=5; do
  grep -qx "$line" "$unit" || fail "the unit lacks $line"
done
if grep -q '^Requires=.*mariadb' "$unit"; then
  fail "the unit must not require mariadb"
fi

env_file="$work/root/etc/beelot/beelot.env"
grep -qx 'BEELOT_BIND=127.0.0.1:8080' "$env_file" || fail "BEELOT_BIND default is wrong"
grep -qx 'BEELOT_STATIC_DIR=/usr/share/beelot/static' "$env_file" || fail "BEELOT_STATIC_DIR default is wrong"
for name in BEELOT_DATABASE_URL BEELOT_DATABASE_USERNAME BEELOT_DATABASE_PASSWORD BEELOT_PUBLIC_URL \
  BEELOT_TRUST_FORWARDED_HEADERS BEELOT_PRIVACY_CONTROLLER BEELOT_PRIVACY_CONTACT \
  BEELOT_HOSTING_PROVIDER BEELOT_HOSTING_DPA BEELOT_BACKUP_RETENTION_DAYS BEELOT_IP_TOKEN_SECRET; do
  grep -q "^#$name=" "$env_file" || fail "the settings file lacks a commented $name"
done

echo "ok"
