#!/usr/bin/env bash
# Fails when a binary needs a newer glibc than the oldest system it must run on: check-glibc.sh BINARY MAX_GLIBC.
# A binary runs on a glibc at least as new as the newest GLIBC_x.y symbol it imports, so building on a newer image
# than Debian stable silently breaks the package there. MAX_GLIBC is Debian stable's glibc (2.41 in trixie).
set -euo pipefail
binary=${1:?usage: check-glibc.sh BINARY MAX_GLIBC}
max=${2:?usage: check-glibc.sh BINARY MAX_GLIBC}
needed=$(objdump -T "$binary" | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' | sed 's/^GLIBC_//' | sort -uV | tail -1)
if [ -z "$needed" ]; then
  echo "$binary imports no versioned glibc symbol: nothing to check."
  exit 0
fi
echo "$binary needs glibc $needed or newer; the limit is $max."
if [ "$(printf '%s\n%s\n' "$needed" "$max" | sort -V | tail -1)" != "$max" ]; then
  echo "::error::$binary needs glibc $needed, newer than $max: build it on an older image." >&2
  exit 1
fi
