#!/usr/bin/env bash
# Builds the Gentoo overlay of a release, with its ebuild and Manifest, as one tarball (US-143).
#
# Usage: build-gentoo-overlay.sh VERSION OUTDIR   (as root in a gentoo/stage3 container, from the repository's root,
# with network access: it syncs the Portage tree, which the Manifest needs, and installs a binary Rust toolchain, which
# `cargo metadata` needs for the crates' licences). The Manifest is made from the release tag's own tarball on GitHub,
# so the tag must exist. Writes OUTDIR/beelot-gentoo-overlay-VERSION.tar.gz.
set -euo pipefail

fail() {
  echo "build-gentoo-overlay: $*" >&2
  exit 1
}

if [ "$#" -ne 2 ]; then
  echo "usage: $0 VERSION OUTDIR" >&2
  exit 2
fi
version=$1
out=$2
repo=/var/db/repos/beelot

emerge-webrsync -q
emerge --quiet --getbinpkg --noreplace dev-lang/rust-bin

# A repos.conf directory replaces Portage's default configuration, so the Gentoo repository is declared in it too.
mkdir -p /etc/portage/repos.conf /var/cache/distfiles
cp /usr/share/portage/config/repos.conf /etc/portage/repos.conf/gentoo.conf
printf '[beelot]\nlocation = %s\n' "$repo" > /etc/portage/repos.conf/beelot.conf
export DISTDIR=/var/cache/distfiles

"$PWD/.github/scripts/prepare-ebuild.sh" "$version" "$repo" > /dev/null
manifest=$repo/games-board/beelot/Manifest
[ -f "$manifest" ] || fail "no Manifest was written"
grep -q "^DIST beelot-$version.tar.gz " "$manifest" || fail "the Manifest does not list the source tarball of v$version"
[ -f "$repo/games-board/beelot/beelot-$version.ebuild" ] || fail "no ebuild was written"
if grep -q '@[A-Z]*@' "$repo/games-board/beelot/beelot-$version.ebuild"; then fail "the ebuild has an unfilled placeholder"; fi

mkdir -p "$out"
tar -C "$repo" -czf "$out/beelot-gentoo-overlay-$version.tar.gz" .
echo "$out/beelot-gentoo-overlay-$version.tar.gz"
