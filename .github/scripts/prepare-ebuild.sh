#!/usr/bin/env bash
# Writes Beelot's Gentoo overlay for a release (US-138) and prints its directory.
#
# Usage: prepare-ebuild.sh VERSION OUTDIR [SOURCE_TARBALL]
# Needs python3 (3.11 or later) and cargo with network access (`cargo metadata` reads the crates' licences). The crates
# come from Cargo.lock of the working tree, which must be the release's. With SOURCE_TARBALL (CI uses `git archive`)
# the Manifest is made from it instead of the tag's tarball on GitHub, so the packaging is tried before a tag exists.
# The Manifest is made when Portage's `ebuild` is installed; otherwise run
#   ebuild OUTDIR/games-board/beelot/beelot-VERSION.ebuild manifest
# on a Gentoo system before publishing the overlay.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 VERSION OUTDIR [SOURCE_TARBALL]" >&2
  exit 2
fi
version=$1
out=$2
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "not a MAJOR.MINOR.PATCH version: $version" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out"
cp -r "$root/packaging/gentoo/." "$out/"
dir=$out/games-board/beelot
metadata=$(mktemp)
trap 'rm -f "$metadata"' EXIT
(cd "$root" && cargo metadata --format-version 1 --locked > "$metadata")
python3 "$here/gentoo-ebuild-data.py" "$dir/beelot.ebuild.in" "$root/Cargo.lock" "$metadata" > "$dir/beelot-$version.ebuild"
rm "$dir/beelot.ebuild.in"

if command -v ebuild > /dev/null; then
  distdir=${DISTDIR:-$(mktemp -d)}
  mkdir -p "$distdir"
  if [ "$#" -eq 3 ]; then cp "$3" "$distdir/beelot-$version.tar.gz"; fi
  DISTDIR=$distdir ebuild "$dir/beelot-$version.ebuild" manifest > /dev/null
fi
echo "$out"
