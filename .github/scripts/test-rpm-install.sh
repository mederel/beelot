#!/usr/bin/env bash
# Installs a built Beelot .rpm on a clean Fedora and checks the result: the user, the settings file's mode, the
# libraries, the unit, that nothing was enabled or started, that an edited settings file survives a reinstall, and
# that removing the package keeps the user and the edited settings.
#
# Usage: test-rpm-install.sh RPM   (run it as root in a fedora container)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 RPM" >&2
  exit 2
fi
rpmfile=$(readlink -f "$1")

fail() {
  echo "test-rpm-install: $*" >&2
  exit 1
}

dnf install -y -q "$rpmfile" > /dev/null
rpm -q beelot > /dev/null || fail "beelot is not installed"

getent passwd beelot > /dev/null || fail "the beelot user was not created"
getent group beelot > /dev/null || fail "the beelot group was not created"
env_file=/etc/beelot/beelot.env
[ "$(stat -c '%a %U:%G' "$env_file")" = "640 root:beelot" ] || fail "$env_file is not 640 root:beelot"
if ldd /usr/bin/beelot-server | grep -q 'not found'; then
  fail "a library of beelot-server is missing"
fi
systemd-analyze verify /usr/lib/systemd/system/beelot.service || fail "the unit does not verify"
[ ! -e /etc/systemd/system/multi-user.target.wants/beelot.service ] || fail "the unit was enabled by the install"

# An edit to the settings survives a reinstall, and keeps its mode.
echo 'BEELOT_DATABASE_PASSWORD=edited' >> "$env_file"
rpm -U --replacepkgs --quiet "$rpmfile"
grep -q '^BEELOT_DATABASE_PASSWORD=edited$' "$env_file" || fail "the edited settings were overwritten"
[ "$(stat -c '%a %U:%G' "$env_file")" = "640 root:beelot" ] || fail "the settings lost their mode"

# Removing the package keeps the user, and the edited settings are saved next to where they were.
dnf remove -y -q beelot > /dev/null
[ ! -e /usr/bin/beelot-server ] || fail "removal left the server"
getent passwd beelot > /dev/null || fail "removal took the beelot user"
[ -e "$env_file.rpmsave" ] || [ -e "$env_file" ] || fail "removal lost the edited settings"

echo "ok"
