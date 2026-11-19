#!/usr/bin/env bash
# Tests packaging/debian/beelot-auto-update with stand-ins for apt, dpkg and systemctl: it runs as the current user pretending
# to be root, and each case sets what the stand-ins answer. Usage: test-auto-update.sh
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
script="$root/packaging/debian/beelot-auto-update"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
bin="$work/bin"; mkdir -p "$bin"

stub() { printf '#!/bin/bash\n%s\n' "$2" > "$bin/$1"; chmod +x "$bin/$1"; }
stub id 'echo 0'
stub logger 'true'
stub flock 'true'
stub apt-get 'echo "apt-get $*" >> "$LOG"; case "$*" in update*) exit "${UPDATE_STATUS:-0}";; *) exit "${INSTALL_STATUS:-0}";; esac'
stub apt-cache 'echo "  Installed: $INSTALLED"; echo "  Candidate: $CANDIDATE"'
stub dpkg-query 'echo -n "$INSTALLED"'
stub dpkg 'shift; [ "$(printf "%s\n%s\n" "$1" "$3" | sort -V | tail -1)" = "$1" ] && [ "$1" != "$3" ]'
stub systemctl 'echo "systemctl $*" >> "$LOG"; case "$1" in is-active) if [ -e "$LOG.restarted" ]; then [ "${RUNNING_AFTER:-yes}" = yes ]; else [ "${RUNNING:-yes}" = yes ]; fi; exit $?;; restart) touch "$LOG.restarted"; exit "${RESTART_STATUS:-0}";; esac'

run() { # name, expected status, then VAR=value settings
  local name=$1 expected=$2; shift 2
  : > "$work/log"; rm -f "$work/log.restarted"
  local status=0
  env PATH="$bin:$PATH" LOG="$work/log" BEELOT_AUTO_UPDATE_STATE="$work/state" BEELOT_AUTO_UPDATE_SETTLE=0 \
    INSTALLED=1.0.0 CANDIDATE=1.1.0 "$@" bash "$script" > "$work/out" 2>&1 || status=$?
  [ "$status" = "$expected" ] || { echo "FAIL $name: status $status, expected $expected"; cat "$work/out"; exit 1; }
  echo "ok   $name"
}
has() { grep -q -e "$1" "$work/log" || { echo "FAIL: expected '$1' in:"; cat "$work/log"; exit 1; }; }
hasnt() { ! grep -q -e "$1" "$work/log" || { echo "FAIL: unexpected '$1' in:"; cat "$work/log"; exit 1; }; }

run "up to date" 0 CANDIDATE=1.0.0; hasnt "install"
run "older candidate" 0 CANDIDATE=0.9.0; hasnt "install"
run "update and restart" 0; has "install -y -qq --only-upgrade --no-remove"; has "systemctl restart beelot"
[ ! -e "$work/state/failed" ] || { echo "FAIL: marker left after a good update"; exit 1; }
run "service was stopped" 0 RUNNING=no; has "install"; hasnt "restart"
run "conflict at install" 1 INSTALL_STATUS=100; hasnt "restart"
[ "$(cat "$work/state/failed")" = 1.1.0 ] || { echo "FAIL: no marker after a conflict"; exit 1; }
run "a failed version is not retried" 1; hasnt "install -y"
rm -f "$work/state/failed"
run "restart fails" 1 RESTART_STATUS=1; has "systemctl restart beelot"
[ "$(cat "$work/state/failed")" = 1.1.0 ] || { echo "FAIL: no marker after a failed restart"; exit 1; }
rm -f "$work/state/failed"
run "not running after the restart" 1 RESTART_STATUS=0 RUNNING_AFTER=no
echo "all passed"
