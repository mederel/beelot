#!/usr/bin/env bash
# Packs the release server (target/release/beelot-server, already built) as dist/beelot-VERSION-1.<arch>.rpm (x86_64 or aarch64, the architecture it runs on).
#
# Usage: build-rpm.sh VERSION   (run it as root in a fedora container, from the repository's root; it installs
# rpm-build and systemd-rpm-macros if they are missing)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 VERSION" >&2
  exit 2
fi
version=$1
# An RPM version has no dash, so the CI build uses a plain 0.0.0.
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "not a MAJOR.MINOR.PATCH version: $version" >&2
  exit 1
fi
root=$(pwd)
[ -x target/release/beelot-server ] || { echo "build the release server first" >&2; exit 1; }

if ! command -v rpmbuild > /dev/null || [ ! -e /usr/lib/rpm/macros.d/macros.systemd ]; then
  dnf install -y -q rpm-build systemd-rpm-macros > /dev/null
fi

top=$(mktemp -d)
trap 'rm -rf "$top"' EXIT
rpmbuild -bb packaging/rpm/beelot.spec --quiet \
  --define "_topdir $top" \
  --define "beelot_version $version" \
  --define "beelot_root $root"
mkdir -p dist
arch=$(uname -m)
cp "$top/RPMS/$arch/beelot-$version-1.$arch.rpm" dist/
echo "dist/beelot-$version-1.$arch.rpm"
