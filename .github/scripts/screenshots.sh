#!/usr/bin/env bash
# Runs the screenshot tests of the key screens (US-205) in Playwright's pinned container, against the server on this host
# (BEELOT_URL, default http://localhost:8080). The images are made and compared there only: fonts and anti-aliasing differ by
# machine. The image is Playwright's, of the exact version of @playwright/test in web/package.json.
#
#   .github/scripts/screenshots.sh                       compare with the approved images
#   .github/scripts/screenshots.sh --update-snapshots    regenerate them (commit them with the change that needs it)
#   .github/scripts/screenshots.sh -g "the home" --project=screens-desktop    any other Playwright option
#
# Needs Docker and the frontend's packages (npm ci in crates/beelot-server/web). On macOS or Windows, whose Docker has no host
# network, set BEELOT_URL=http://host.docker.internal:8080.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
web=crates/beelot-server/web
version=$(node -p "require('$root/$web/package.json').devDependencies['@playwright/test']")
if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "@playwright/test is '$version' in $web/package.json: pin an exact version, the container image is taken from it" >&2
  exit 1
fi
image=mcr.microsoft.com/playwright:v$version-noble

# The container runs as root (Chromium's sandbox needs it) and hands what it wrote back to the caller.
docker run --rm --init --ipc=host --network host \
  -v "$root":/work -w "/work/$web" \
  -e BEELOT_URL -e BEELOT_SCREENSHOT_SABOTAGE -e CI \
  -e OWNER="$(id -u):$(id -g)" \
  "$image" \
  bash -c 'npx playwright test -c playwright.screenshots.config.ts "$@"; status=$?; chown -R "$OWNER" e2e/screenshots test-results 2> /dev/null || true; exit $status' playwright "$@"
