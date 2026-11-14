#!/usr/bin/env bash
# Prints the next release version (without the "v" prefix), or nothing when
# HEAD is already released.
#
# The first release is 1.0.0. After that, semantic versioning from the commits
# since the last v* tag: a major bump when one is breaking (a "!" before the
# colon, such as "feat!:" or "fix(deps)!:"), else a minor bump when one is a
# feature (subject "feat:" or "feat(scope):"), a patch bump otherwise.
set -euo pipefail

last=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)
if [ -z "$last" ]; then
  echo "1.0.0"
  exit 0
fi

range="$last..HEAD"
if [ "$(git rev-list --count "$range")" -eq 0 ]; then
  exit 0
fi

IFS=. read -r major minor patch <<< "${last#v}"
subjects=$(git log --format=%s "$range")
if grep -qE '^[a-z]+(\([^)]*\))?!:' <<< "$subjects"; then
  echo "$((major + 1)).0.0"
elif grep -qE '^feat(\([^)]*\))?:' <<< "$subjects"; then
  echo "$major.$((minor + 1)).0"
else
  echo "$major.$minor.$((patch + 1))"
fi
