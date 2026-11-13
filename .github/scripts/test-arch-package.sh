#!/usr/bin/env bash
# Builds the Arch package from the working tree in a clean Arch container, installs it and checks the result (US-136):
# the user and group, the settings file's owner and mode, that it is a backup file, the libraries, the unit, that nothing
# was enabled, and that removal keeps the user.
#
# Usage: test-arch-package.sh   (run it as root in an archlinux container, from the repository's root)
set -euo pipefail

fail() {
  echo "test-arch-package: $*" >&2
  exit 1
}

pacman -Syu --noconfirm --needed base-devel git cargo > /dev/null
git config --global --add safe.directory "$PWD"
root=$PWD

# makepkg refuses to run as root.
id builder > /dev/null 2>&1 || useradd --create-home builder
work=/home/builder/build
rm -rf "$work" && mkdir -p "$work"
git archive --format=tar.gz --prefix=beelot-0.0.0/ -o "$work/src.tar.gz" HEAD
chown -R builder "$work"
su builder -c "'$root/packaging/arch/prepare-pkgbuild.sh' 0.0.0 '$work/pkg' '$work/src.tar.gz'"
su builder -c "cd '$work/pkg' && makepkg --noconfirm --nodeps"
package=$(ls "$work"/pkg/beelot-0.0.0-1-x86_64.pkg.tar.* | head -1)
[ -f "$package" ] || fail "no package was built"

pacman -U --noconfirm "$package" > /dev/null
pacman -Q beelot > /dev/null || fail "beelot is not installed"
getent passwd beelot > /dev/null || fail "the beelot user was not created"
getent group beelot > /dev/null || fail "the beelot group was not created"
env_file=/etc/beelot/beelot.env
[ "$(stat -c '%a %U:%G' "$env_file")" = "640 root:beelot" ] || fail "$env_file is '$(stat -c '%a %U:%G' "$env_file")', not 640 root:beelot"
[ "$(stat -c '%a %U:%G' /etc/beelot)" = "750 root:beelot" ] || fail "/etc/beelot is not 750 root:beelot"
pacman -Qii beelot | grep -q "etc/beelot/beelot.env" || fail "the settings file is not tracked"
pacman -Qii beelot | sed -n '/^Backup Files/,$p' | grep -q "etc/beelot/beelot.env" || fail "the settings file is not a backup file"
[ -x /usr/bin/beelot-server ] || fail "the server is not installed"
[ -f /usr/share/beelot/static/index.html ] || fail "the frontend is not installed"
if ldd /usr/bin/beelot-server | grep -q 'not found'; then
  fail "a library of beelot-server is missing"
fi
systemd-analyze verify /usr/lib/systemd/system/beelot.service || fail "the unit does not verify"
[ ! -e /etc/systemd/system/multi-user.target.wants/beelot.service ] || fail "the unit was enabled by the install"

pacman -R --noconfirm beelot > /dev/null
[ ! -e /usr/bin/beelot-server ] || fail "removal left the server"
getent passwd beelot > /dev/null || fail "removal took the beelot user"

echo "ok"
