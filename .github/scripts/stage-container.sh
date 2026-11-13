#!/usr/bin/env bash
# Puts everything the container image is built from in one directory (US-135).
#
# Usage: stage-container.sh BINARY STATIC_DIR DEST
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 BINARY STATIC_DIR DEST" >&2
  exit 2
fi
binary=$1
static=$2
dest=$3
here=$(cd "$(dirname "$0")/../.." && pwd)

[ -x "$binary" ] || { echo "no such executable: $binary" >&2; exit 1; }
[ -f "$static/index.html" ] || { echo "no frontend in $static" >&2; exit 1; }
rm -rf "$dest"
mkdir -p "$dest"
cp "$binary" "$dest/beelot-server"
cp -r "$static" "$dest/static"
cp "$here/packaging/container/Dockerfile" "$dest/Dockerfile"
echo "$dest"
