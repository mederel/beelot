#!/usr/bin/env bash
# Tests build-apt-repo.sh end to end with a throwaway key and two stub packages:
# the layout, the index, the signatures, a real `apt-get install` from the
# repository, and that tampering with the index is refused.
#
# Run it as root on Debian or Ubuntu with dpkg-dev, apt-utils and gnupg installed
# (it installs a package and rewrites apt's lists, so use a container or a CI runner).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
build=$here/build-apt-repo.sh

fail() {
  echo "test-apt-repo: $*" >&2
  exit 1
}

work=$(mktemp -d)
# apt's sandbox user must be able to read the repository, so it is not under mktemp's 0700 directory.
repo=/srv/beelot-apt-test
sources=$work/sources.d
trap 'rm -rf "$work" "$repo"' EXIT

export GNUPGHOME=$work/gnupg
mkdir -m 700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-generate-key 'Beelot test <test@example.invalid>' rsa3072 sign never
key=$(gpg --list-secret-keys --with-colons | awk -F: '/^fpr/ { print $10; exit }')
[ -n "$key" ] || fail "no test key"

# A stub package: no dependencies, one file naming its version.
stub() {
  local version=$1 dir=$work/stub-$1
  mkdir -p "$dir/DEBIAN" "$dir/usr/share/beelot" "$work/debs-all"
  cat > "$dir/DEBIAN/control" <<EOF
Package: beelot
Version: $version
Architecture: amd64
Maintainer: Test <test@example.invalid>
Description: stub
EOF
  echo "$version" > "$dir/usr/share/beelot/version"
  dpkg-deb --root-owner-group --build "$dir" "$work/debs-all/beelot_${version}_amd64.deb" > /dev/null
}
stub 1.0.0
stub 1.1.0

# The first release: a single package.
mkdir "$work/debs-first"
cp "$work/debs-all/beelot_1.0.0_amd64.deb" "$work/debs-first/"
rm -rf "$repo"
mkdir -p "$repo"
chmod 755 "$repo"
"$build" "$work/debs-first" "$repo" "$key"
grep -q '^Version: 1.0.0$' "$repo/dists/stable/main/binary-amd64/Packages" || fail "the first release is not indexed"

# A later release: both packages, into the same directory.
"$build" "$work/debs-all" "$repo" "$key"
chmod -R a+rX "$repo"

for path in beelot.asc dists/stable/Release dists/stable/InRelease dists/stable/Release.gpg \
  dists/stable/main/binary-amd64/Packages dists/stable/main/binary-amd64/Packages.gz \
  pool/main/b/beelot/beelot_1.0.0_amd64.deb pool/main/b/beelot/beelot_1.1.0_amd64.deb; do
  [ -f "$repo/$path" ] || fail "missing $path"
done

packages=$repo/dists/stable/main/binary-amd64/Packages
grep -q '^Version: 1.0.0$' "$packages" || fail "Packages lacks 1.0.0"
grep -q '^Version: 1.1.0$' "$packages" || fail "Packages lacks 1.1.0"

release=$repo/dists/stable/Release
for line in 'Suite: stable' 'Codename: stable' 'Architectures: amd64' 'Components: main'; do
  grep -qx "$line" "$release" || fail "Release lacks '$line'"
done
grep -q 'main/binary-amd64/Packages$' "$release" || fail "Release does not list Packages"
grep -q "$(sha256sum "$packages" | cut -d' ' -f1)" "$release" || fail "Release lacks the SHA256 of Packages"

# The signatures check out against the published public key alone, in an empty keyring.
verifier=$(mktemp -d "$work/verify.XXXX")
chmod 700 "$verifier"
GNUPGHOME=$verifier gpg --batch --quiet --import "$repo/beelot.asc"
GNUPGHOME=$verifier gpg --batch --quiet --verify "$repo/dists/stable/InRelease" 2> /dev/null || fail "InRelease does not verify"
GNUPGHOME=$verifier gpg --batch --quiet --verify "$repo/dists/stable/Release.gpg" "$release" 2> /dev/null || fail "Release.gpg does not verify"

# A passphrase-protected key, as in the workflow: the right passphrase signs, a wrong one fails.
gpg --batch --quiet --passphrase 'right horse' --quick-generate-key 'Beelot locked <locked@example.invalid>' rsa3072 sign never
locked=$(gpg --list-secret-keys --with-colons 'locked@example.invalid' | awk -F: '/^fpr/ { print $10; exit }')
locked_repo=$work/locked-repo
mkdir "$locked_repo"
APT_GPG_PASSPHRASE='right horse' "$build" "$work/debs-all" "$locked_repo" "$locked" > /dev/null 2>&1 \
  || fail "signing with the right passphrase failed"
GNUPGHOME=$verifier gpg --batch --quiet --import "$locked_repo/beelot.asc"
GNUPGHOME=$verifier gpg --batch --quiet --verify "$locked_repo/dists/stable/InRelease" 2> /dev/null \
  || fail "the passphrase-protected InRelease does not verify"
gpgconf --kill gpg-agent # it caches the right passphrase
if APT_GPG_PASSPHRASE='wrong' "$build" "$work/debs-all" "$work/locked-repo-bad" "$locked" > /dev/null 2>&1; then
  fail "signing with a wrong passphrase succeeded"
fi

# No private key reaches the published tree.
if gpg --show-keys --with-colons "$repo/beelot.asc" | grep -q '^sec'; then
  fail "beelot.asc holds a private key"
fi
if grep -rl 'PRIVATE KEY' "$repo" > /dev/null; then
  fail "a private key block is in the repository"
fi

# apt installs from it, takes the newest, and an older version stays installable.
mkdir "$sources"
cat > "$sources/beelot-test.sources" <<EOF
Types: deb
URIs: file://$repo
Suites: stable
Components: main
Architectures: amd64
Signed-By: $repo/beelot.asc
EOF
apt_opts=(-o "Dir::Etc::sourceparts=$sources" -o Dir::Etc::sourcelist=/dev/null)
rm -rf /var/lib/apt/lists/*
apt-get "${apt_opts[@]}" update -qq || fail "apt-get update failed"
apt-get "${apt_opts[@]}" install -y -qq beelot > /dev/null || fail "apt-get install failed"
[ "$(cat /usr/share/beelot/version)" = 1.1.0 ] || fail "apt did not install the newest version"
apt-get "${apt_opts[@]}" install -y -qq --allow-downgrades beelot=1.0.0 > /dev/null || fail "1.0.0 is not installable"
[ "$(cat /usr/share/beelot/version)" = 1.0.0 ] || fail "1.0.0 was not installed"

# The signature protects the index: a tampered Packages is refused.
echo "Tampered: yes" >> "$packages"
gzip -9kf "$packages"
rm -rf /var/lib/apt/lists/*
if apt-get "${apt_opts[@]}" update -qq > /dev/null 2>&1; then
  fail "apt accepted a tampered Packages"
fi

echo "ok"
