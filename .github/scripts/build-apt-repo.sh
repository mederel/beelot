#!/usr/bin/env bash
# Builds a signed apt repository from a directory of Beelot .deb files.
#
# Usage: build-apt-repo.sh DEBS_DIR OUT_DIR KEY_ID
#
# It also writes the site's page (pages/ in the repository, US-132) at the root of
# OUT_DIR, with the newest release's version filled in. When BEELOT_PLAY_URL names
# the hosted game (no trailing slash) the page links to it; without it those links
# are left out.
#
# KEY_ID names a secret key already in the current GNUPGHOME. When
# APT_GPG_PASSPHRASE is set it unlocks that key. The tree written to OUT_DIR is
# what GitHub Pages serves:
#
#   index.html, site.css, site.js, images/        the site's page
#   beelot.asc                                    the public key
#   dists/stable/{Release,InRelease,Release.gpg}  the signed index
#   dists/stable/main/binary-<arch>/Packages(.gz) for each architecture that has a package (amd64, arm64)
#   pool/main/b/beelot/beelot_<version>_<arch>.deb
#
# Needs dpkg-dev, apt-utils and gnupg.
set -euo pipefail
set +x # never trace: the passphrase is in the environment

if [ "$#" -ne 3 ]; then
  echo "usage: $0 DEBS_DIR OUT_DIR KEY_ID" >&2
  exit 2
fi
debs=$1
out=$2
key=$3

shopt -s nullglob
packages=("$debs"/beelot_*_amd64.deb "$debs"/beelot_*_arm64.deb)
if [ "${#packages[@]}" -eq 0 ]; then
  echo "build-apt-repo: no beelot_*_amd64.deb or beelot_*_arm64.deb in $debs" >&2
  exit 1
fi

# The architectures that have a package: an index is written for each.
architectures=()
for arch in amd64 arm64; do
  found=("$debs"/beelot_*_"$arch".deb)
  if [ "${#found[@]}" -gt 0 ]; then architectures+=("$arch"); fi
done

rm -rf "$out/dists" "$out/pool" "$out/beelot.asc"
mkdir -p "$out/pool/main/b/beelot"
for arch in "${architectures[@]}"; do mkdir -p "$out/dists/stable/main/binary-$arch"; done
cp "${packages[@]}" "$out/pool/main/b/beelot/"

(
  cd "$out"
  for arch in "${architectures[@]}"; do
    dpkg-scanpackages --multiversion --arch "$arch" pool/main /dev/null > "dists/stable/main/binary-$arch/Packages"
    gzip -9kf "dists/stable/main/binary-$arch/Packages"
  done
  apt-ftparchive \
    -o APT::FTPArchive::Release::Origin=Beelot \
    -o APT::FTPArchive::Release::Label=Beelot \
    -o APT::FTPArchive::Release::Suite=stable \
    -o APT::FTPArchive::Release::Codename=stable \
    -o "APT::FTPArchive::Release::Architectures=${architectures[*]}" \
    -o APT::FTPArchive::Release::Components=main \
    release dists/stable > dists/stable/Release
)

# Signs from standard input so the passphrase never appears in a command line.
sign() {
  if [ -n "${APT_GPG_PASSPHRASE:-}" ]; then
    printf '%s' "$APT_GPG_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
      --passphrase-fd 0 --default-key "$key" "$@"
  else
    gpg --batch --yes --quiet --default-key "$key" "$@"
  fi
}
sign --clearsign --output "$out/dists/stable/InRelease" "$out/dists/stable/Release"
sign --armor --detach-sign --output "$out/dists/stable/Release.gpg" "$out/dists/stable/Release"
gpg --armor --export "$key" > "$out/beelot.asc"

# The site's page: the newest release's number in the install text, the hosted game's links only when it is known.
pages=$(cd "$(dirname "$0")/../.." && pwd)/pages
latest=$(for package in "${packages[@]}"; do dpkg-deb -f "$package" Version; done | sort -V | tail -n 1)
rm -rf "$out/images" "$out/index.html" "$out/site.css" "$out/site.js"
mkdir -p "$out/images"
cp "$pages/site.css" "$pages/site.js" "$out/"
cp "$pages/../docs/images/home.jpg" "$pages/../docs/images/bidding.jpg" "$pages/../docs/images/logo.svg" "$out/images/"
play=${BEELOT_PLAY_URL:-}
if [ -n "$play" ]; then
  sed -e "s|{{VERSION}}|$latest|g" -e "s|{{PLAY_URL}}|$play|g" "$pages/index.html" > "$out/index.html"
else
  sed -e "s|{{VERSION}}|$latest|g" -e '/data-play/d' "$pages/index.html" > "$out/index.html"
fi

echo "build-apt-repo: ${#packages[@]} package(s) in $out"
