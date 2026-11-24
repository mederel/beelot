#!/usr/bin/env bash
# Builds the release server and packs it as dist/beelot_VERSION_<arch>.deb, for the architecture it runs on (amd64 or arm64).
# With --prebuilt it packs target/release/beelot-server as it is: CI's build job made it, with the version compiled in.
#
# Usage: build-deb.sh [--prebuilt] VERSION   (needs cargo-deb; see packaging/debian/)
set -euo pipefail

prebuilt=false
if [ "${1:-}" = --prebuilt ]; then
  prebuilt=true
  shift
fi
if [ "$#" -ne 1 ]; then
  echo "usage: $0 [--prebuilt] VERSION" >&2
  exit 2
fi
version=$1
if $prebuilt && [ ! -x target/release/beelot-server ]; then
  echo "build the release server first (target/release/beelot-server)" >&2
  exit 1
fi

mkdir -p dist target
# Debian wants a changelog; this one points at the release notes, so it cannot go stale.
cat > target/debian-changelog <<CHANGELOG
beelot ($version) stable; urgency=medium

  * Release v$version, see https://github.com/mederel/beelot/releases/tag/v$version

 -- Beelot <mederel@users.noreply.github.com>  $(date -R -u)
CHANGELOG
if ! $prebuilt; then
  BEELOT_VERSION="$version" cargo build --release --locked -p beelot-server
fi
arch=$(dpkg --print-architecture)
cargo deb -p beelot-server --no-build --deb-version "$version" \
  -o "dist/beelot_${version}_${arch}.deb"
