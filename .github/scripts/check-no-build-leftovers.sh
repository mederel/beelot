#!/usr/bin/env bash
# Fails when a Python cache (__pycache__/ or a compiled .pyc) is tracked by git (US-197).
# Usage: check-no-build-leftovers.sh [repository]   (default: the current directory)
set -euo pipefail
cd "${1:-.}"
found=$(git ls-files | grep -E '(^|/)__pycache__/|\.py[co]$' || true)
if [ -n "$found" ]; then
  echo "$found"
  echo "::error::Build leftovers are tracked: remove them with git rm --cached (they are ignored by .gitignore)"
  exit 1
fi
