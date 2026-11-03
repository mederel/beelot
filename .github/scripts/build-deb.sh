#!/usr/bin/env bash
# Builds the release server and packs it as dist/beelot_VERSION_amd64.deb.
#
# Usage: build-deb.sh VERSION   (needs cargo-deb; see packaging/debian/)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 VERSION" >&2
  exit 2
fi
version=$1

mkdir -p dist
cargo build --release --locked -p beelot-server
cargo deb -p beelot-server --no-build --deb-version "$version" \
  -o "dist/beelot_${version}_amd64.deb"
