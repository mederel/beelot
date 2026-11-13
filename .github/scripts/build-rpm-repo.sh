#!/usr/bin/env bash
# Adds a signed dnf (rpm-md) repository, built from a directory of Beelot .rpm files, to the tree GitHub Pages serves
# (US-134). Run it after build-apt-repo.sh, on the same OUT_DIR: it only touches rpm/ and beelot.asc.
#
# Usage: build-rpm-repo.sh RPMS_DIR OUT_DIR KEY_ID
#
# KEY_ID names a secret key already in the current GNUPGHOME (the apt repository's key). When APT_GPG_PASSPHRASE is set
# it unlocks that key. What is written:
#
#   beelot.asc                                    the public key (the same file as for apt)
#   rpm/beelot.repo                               the file to give to dnf
#   rpm/beelot-<version>-1.{x86_64,aarch64}.rpm   every release's packages (dnf picks the machine's own)
#   rpm/repodata/repomd.xml(.asc)                 the index and its detached signature
#
# The metadata is signed (repo_gpgcheck=1) and lists the SHA-256 of every package, so a package cannot be swapped without
# breaking the signature; the packages themselves are not individually signed.
# Needs createrepo_c and gnupg.
set -euo pipefail
set +x # never trace: the passphrase is in the environment

if [ "$#" -ne 3 ]; then
  echo "usage: $0 RPMS_DIR OUT_DIR KEY_ID" >&2
  exit 2
fi
rpms=$1
out=$2
key=$3

shopt -s nullglob
packages=("$rpms"/beelot-*.x86_64.rpm "$rpms"/beelot-*.aarch64.rpm)
if [ "${#packages[@]}" -eq 0 ]; then
  echo "build-rpm-repo: no beelot-*.x86_64.rpm or beelot-*.aarch64.rpm in $rpms" >&2
  exit 1
fi

rm -rf "$out/rpm"
mkdir -p "$out/rpm"
cp "${packages[@]}" "$out/rpm/"
createrepo_c --quiet "$out/rpm"

# Signs from standard input so the passphrase never appears in a command line.
sign() {
  if [ -n "${APT_GPG_PASSPHRASE:-}" ]; then
    printf '%s' "$APT_GPG_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
      --passphrase-fd 0 --default-key "$key" "$@"
  else
    gpg --batch --yes --quiet --default-key "$key" "$@"
  fi
}
sign --armor --detach-sign --output "$out/rpm/repodata/repomd.xml.asc" "$out/rpm/repodata/repomd.xml"
gpg --armor --export "$key" > "$out/beelot.asc"

cat > "$out/rpm/beelot.repo" <<'REPO'
[beelot]
name=Beelot
baseurl=https://mederel.github.io/beelot/rpm
enabled=1
gpgcheck=0
repo_gpgcheck=1
gpgkey=https://mederel.github.io/beelot/beelot.asc
REPO

echo "build-rpm-repo: ${#packages[@]} package(s) in $out/rpm"
