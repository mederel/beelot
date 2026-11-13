#!/usr/bin/env bash
# Fills in the PKGBUILD for a release (US-136) and prints the directory to run makepkg in.
#
# Usage: prepare-pkgbuild.sh VERSION OUTDIR [SOURCE_TARBALL]
# Without SOURCE_TARBALL the tag's tarball from GitHub is downloaded to compute its checksum. With one (CI uses
# `git archive` of the working tree) it is used as the source instead, so the packaging is tried before a tag exists.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 VERSION OUTDIR [SOURCE_TARBALL]" >&2
  exit 2
fi
version=$1
out=$2
here=$(cd "$(dirname "$0")" && pwd)
# makepkg allows no dash in a version.
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "not a MAJOR.MINOR.PATCH version: $version" >&2
  exit 1
fi

mkdir -p "$out"
cp "$here/PKGBUILD" "$here/beelot.sysusers" "$here/beelot.tmpfiles" "$out/"
tarball="$out/beelot-$version.tar.gz"
if [ "$#" -eq 3 ]; then
  cp "$3" "$tarball"
else
  curl -fsSL "https://github.com/mederel/beelot/archive/refs/tags/v$version.tar.gz" -o "$tarball"
fi
sha=$(sha256sum "$tarball" | cut -d' ' -f1)
sysusers=$(sha256sum "$out/beelot.sysusers" | cut -d' ' -f1)
tmpfiles=$(sha256sum "$out/beelot.tmpfiles" | cut -d' ' -f1)
sed -i -e "s/^pkgver=.*/pkgver=$version/" \
  -e "s/^sha256sums=.*/sha256sums=($sha $sysusers $tmpfiles)/" "$out/PKGBUILD"
if [ "$#" -eq 3 ]; then
  # A local tarball: makepkg takes it from the directory instead of downloading it.
  sed -i -e 's|"\$pkgname-\$pkgver.tar.gz::\$url/archive/refs/tags/v\$pkgver.tar.gz"|"$pkgname-$pkgver.tar.gz"|' "$out/PKGBUILD"
fi
echo "$out"
