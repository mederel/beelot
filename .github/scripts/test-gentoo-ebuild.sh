#!/usr/bin/env bash
# Tries Beelot's Gentoo ebuild on a stage3 (US-138): pkgcheck scans the overlay, the ebuild's compile and install phases
# run, the image has the files the other packages install, the package merges, creates the user and the group, protects
# the settings, enables nothing, and leaves the user when removed.
#
# Usage: test-gentoo-ebuild.sh   (run it as root in a gentoo/stage3 container, from the repository's root; it takes long:
# it syncs the Portage tree, installs a binary Rust toolchain and compiles the server)
set -euo pipefail

fail() {
  echo "test-gentoo-ebuild: $*" >&2
  exit 1
}

root=$PWD
version=0.0.0
repo=/var/db/repos/beelot
distdir=/var/cache/distfiles

emerge-webrsync -q
# Binary packages from the official binhost where it has them, to spare compiling the tools.
emerge --quiet --getbinpkg --noreplace dev-lang/rust-bin dev-util/pkgcheck

# The source is the working tree, as a release tarball would hold it.
mkdir -p "$distdir"
tar -C "$root" --exclude=./target --exclude=./.git --transform "s,^\./,beelot-$version/," -czf "$distdir/beelot-$version.tar.gz" .

mkdir -p /etc/portage/repos.conf /etc/portage/package.use /etc/portage/package.accept_keywords
# A repos.conf directory replaces Portage's default configuration, so the Gentoo repository is declared in it too
# (pkgcheck reads this directory and has no default of its own).
cp /usr/share/portage/config/repos.conf /etc/portage/repos.conf/gentoo.conf
cat > /etc/portage/repos.conf/beelot.conf <<CONF
[beelot]
location = $repo
CONF
echo 'games-board/beelot -mariadb' > /etc/portage/package.use/beelot
echo 'games-board/beelot ~amd64' > /etc/portage/package.accept_keywords/beelot
# The container has no kernel namespaces to give Portage's sandboxes.
export FEATURES="-sandbox -usersandbox -network-sandbox -pid-sandbox -ipc-sandbox"
export DISTDIR=$distdir

"$root/.github/scripts/prepare-ebuild.sh" "$version" "$repo" "$distdir/beelot-$version.tar.gz" > /dev/null
ebuild_file=$repo/games-board/beelot/beelot-$version.ebuild
[ -f "$ebuild_file" ] || fail "no ebuild was written"
[ -f "$repo/games-board/beelot/Manifest" ] || fail "no Manifest was written"
if grep -q '@[A-Z]*@' "$ebuild_file"; then fail "the ebuild has an unfilled placeholder"; fi
# The crates are the Cargo.lock's: 412 registry crates.
crates=$(sed -n '/^CRATES="/,/^"/p' "$ebuild_file" | grep -c '^	[a-z0-9_-]')
expected=$(grep -c '^source = "registry+' "$root/Cargo.lock")
[ "$crates" = "$expected" ] || fail "CRATES lists $crates crates, Cargo.lock has $expected"

(cd "$repo" && pkgcheck scan --exit error) || fail "pkgcheck found errors"

emerge --quiet --getbinpkg --onlydeps "=games-board/beelot-$version"
ebuild "$ebuild_file" clean install
image=/var/tmp/portage/games-board/beelot-$version/image
[ -x "$image/usr/bin/beelot-server" ] || fail "the server is not in the image"
[ -f "$image/usr/share/beelot/static/index.html" ] || fail "the frontend is not in the image"
[ -f "$image/usr/lib/systemd/system/beelot.service" ] || fail "the systemd unit is not in the image"
[ -x "$image/etc/init.d/beelot" ] || fail "the OpenRC script is not in the image"
[ "$(stat -c '%a %U:%G' "$image/etc/beelot/beelot.env")" = "640 root:beelot" ] || fail "beelot.env is not 640 root:beelot"
[ "$(stat -c '%a %U:%G' "$image/etc/beelot")" = "750 root:beelot" ] || fail "/etc/beelot is not 750 root:beelot"
[ -f "$image/usr/share/doc/beelot-$version/README.md.bz2" ] || fail "the README is not in the image"

ebuild "$ebuild_file" qmerge
getent passwd beelot > /dev/null || fail "the beelot user was not created"
getent group beelot > /dev/null || fail "the beelot group was not created"
if ldd /usr/bin/beelot-server | grep -q 'not found'; then fail "a library of beelot-server is missing"; fi
sh -n /etc/init.d/beelot || fail "the OpenRC script does not parse"
[ ! -e /etc/runlevels/default/beelot ] || fail "the service was enabled by the install"

emerge --quiet --unmerge games-board/beelot
[ ! -e /usr/bin/beelot-server ] || fail "removal left the server"
getent passwd beelot > /dev/null || fail "removal took the beelot user"

echo "ok"
