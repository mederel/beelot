#!/usr/bin/env bash
# Checks a built Beelot .rpm: its metadata, dependencies, files and modes, scriptlets, unit and settings file.
#
# Usage: check-rpm.sh RPM VERSION   (needs rpm; run it in the fedora container)
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 RPM VERSION" >&2
  exit 2
fi
rpmfile=$1
version=$2

fail() {
  echo "check-rpm: $*" >&2
  exit 1
}

[ -f "$rpmfile" ] || fail "no such file: $rpmfile"
query() { rpm -qp --qf "$1" "$rpmfile"; }

[ "$(query '%{NAME}')" = beelot ] || fail "Name is not beelot"
[ "$(query '%{VERSION}')" = "$version" ] || fail "Version is $(query '%{VERSION}'), expected $version"
[ "$(query '%{ARCH}')" = x86_64 ] || fail "Architecture is not x86_64"

requires=$(rpm -qp --requires "$rpmfile")
# The glibc of the build image is required, so dnf refuses a system too old to run the server.
echo "$requires" | grep -q 'libc.so.6(GLIBC_2\.[0-9]*)' || fail "no glibc version is required"
echo "$requires" | grep -q 'shadow-utils' || fail "shadow-utils is not required for the user"
if echo "$requires" | grep -qi 'mariadb\|mysql'; then
  fail "the database must not be a hard dependency"
fi
rpm -qp --recommends "$rpmfile" | grep -q 'mariadb-server' || fail "mariadb-server is not recommended"

files=$(rpm -qlvp "$rpmfile")
# Prints the mode and owner of the packaged path.
entry() { echo "$files" | awk -v path="$1" '$NF == path { print $1, $3, $4 }'; }
expect() {
  local path=$1 want=$2 actual
  actual=$(entry "$path")
  [ -n "$actual" ] || fail "$path is not packaged"
  [ "$actual" = "$want" ] || fail "$path is '$actual', expected '$want'"
}
expect /usr/bin/beelot-server "-rwxr-xr-x root root"
expect /usr/share/beelot/static/index.html "-rw-r--r-- root root"
expect /usr/lib/systemd/system/beelot.service "-rw-r--r-- root root"
expect /etc/beelot/beelot.env "-rw-r----- root beelot"
expect /etc/beelot "drwxr-x--- root beelot"

# Edits to the settings are kept on upgrade: the file is a %config with noreplace (flags c and n).
flags=$(rpm -qp --qf '[%{FILEFLAGS:fflags} %{FILENAMES}\n]' "$rpmfile" | awk '$2 == "/etc/beelot/beelot.env" { print $1 }')
case "$flags" in *c*) ;; *) fail "/etc/beelot/beelot.env is not a config file" ;; esac
case "$flags" in *n*) ;; *) fail "/etc/beelot/beelot.env is replaced on upgrade (not noreplace)" ;; esac

scripts=$(rpm -qp --scripts "$rpmfile")
echo "$scripts" | grep -q 'useradd' || fail "the pre scriptlet does not create the user"
echo "$scripts" | grep -q 'beelot.service' || fail "the scriptlets do not handle the unit"
# A fresh install must not start (or enable) a service whose database does not exist yet.
if echo "$scripts" | grep -Eq 'systemctl (enable|start)'; then
  fail "a scriptlet enables or starts the unit by itself"
fi

command -v cpio > /dev/null || dnf install -y -q cpio > /dev/null
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(cd "$work" && rpm2cpio "$(readlink -f "$rpmfile")" | cpio -idm --quiet)

unit="$work/usr/lib/systemd/system/beelot.service"
for line in User=beelot EnvironmentFile=/etc/beelot/beelot.env Restart=on-failure \
  Wants=network-online.target ExecStart=/usr/bin/beelot-server StartLimitIntervalSec=60 StartLimitBurst=5; do
  grep -qx "$line" "$unit" || fail "the unit lacks $line"
done
if grep -q '^Requires=.*mariadb' "$unit"; then
  fail "the unit must not require mariadb"
fi

env_file="$work/etc/beelot/beelot.env"
grep -qx 'BEELOT_BIND=127.0.0.1:8080' "$env_file" || fail "BEELOT_BIND default is wrong"
grep -qx 'BEELOT_STATIC_DIR=/usr/share/beelot/static' "$env_file" || fail "BEELOT_STATIC_DIR default is wrong"
for name in BEELOT_DATABASE_URL BEELOT_DATABASE_USERNAME BEELOT_DATABASE_PASSWORD BEELOT_PUBLIC_URL \
  BEELOT_TRUST_FORWARDED_HEADERS BEELOT_PRIVACY_CONTROLLER BEELOT_PRIVACY_CONTACT \
  BEELOT_HOSTING_PROVIDER BEELOT_HOSTING_DPA BEELOT_BACKUP_RETENTION_DAYS BEELOT_IP_TOKEN_SECRET; do
  grep -q "^#$name=" "$env_file" || fail "the settings file lacks a commented $name"
done

echo "ok"
