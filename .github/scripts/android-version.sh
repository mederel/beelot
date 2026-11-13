#!/usr/bin/env bash
# The Android versionCode of a release (US-128): android-version.sh 1.12.3 prints 1012003. Play needs an integer that
# only grows, so major, minor and patch each get their own digits (minor and patch below 1000).
set -euo pipefail
version=${1:?usage: android-version.sh MAJOR.MINOR.PATCH}
if [[ ! $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "not a MAJOR.MINOR.PATCH version: $version" >&2
  exit 1
fi
major=${BASH_REMATCH[1]} minor=${BASH_REMATCH[2]} patch=${BASH_REMATCH[3]}
if ((10#$minor > 999 || 10#$patch > 999 || 10#$major > 2000)); then
  echo "version out of range for a versionCode: $version" >&2
  exit 1
fi
echo $((10#$major * 1000000 + 10#$minor * 1000 + 10#$patch))
