#!/usr/bin/env bash
# Tests build-rpm-repo.sh end to end with a throwaway key and two stub packages: the layout, the signature, a real
# `dnf install` from the repository with repo_gpgcheck on, and that tampering with the index is refused.
#
# Run it as root in a fedora container, from the repository's root (it installs the tools it needs).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
build=$here/build-rpm-repo.sh

fail() {
  echo "test-rpm-repo: $*" >&2
  exit 1
}

dnf install -y -q createrepo_c gnupg2 rpm-build dnf-plugins-core > /dev/null

work=$(mktemp -d)
repo=$work/site
trap 'rm -rf "$work"' EXIT

export GNUPGHOME=$work/gnupg
mkdir -m 700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-generate-key 'Beelot test <test@example.invalid>' rsa3072 sign never
key=$(gpg --list-secret-keys --with-colons | awk -F: '/^fpr/ { print $10; exit }')
[ -n "$key" ] || fail "no test key"

# A stub package: no dependencies, one file naming its version.
mkdir -p "$work/rpms"
stub() {
  local version=$1 top=$work/top-$1
  mkdir -p "$top"
  cat > "$work/stub.spec" <<SPEC
Name: beelot
Version: $version
Release: 1
Summary: stub
License: AGPL-3.0-or-later
BuildArch: x86_64
%description
stub
%install
mkdir -p %{buildroot}/usr/share/beelot
echo $version > %{buildroot}/usr/share/beelot/version
%files
/usr/share/beelot/version
SPEC
  rpmbuild -bb "$work/stub.spec" --quiet --define "_topdir $top" > /dev/null
  cp "$top/RPMS/x86_64/beelot-$version-1.x86_64.rpm" "$work/rpms/"
}
stub 1.0.0
stub 1.1.0

mkdir -p "$repo"
"$build" "$work/rpms" "$repo" "$key" > /dev/null

for path in beelot.asc rpm/beelot.repo rpm/repodata/repomd.xml rpm/repodata/repomd.xml.asc \
  rpm/beelot-1.0.0-1.x86_64.rpm rpm/beelot-1.1.0-1.x86_64.rpm; do
  [ -f "$repo/$path" ] || fail "missing $path"
done
ls "$repo"/rpm/repodata/*primary* > /dev/null || fail "no primary metadata"
grep -qx 'repo_gpgcheck=1' "$repo/rpm/beelot.repo" || fail "the .repo file does not check the metadata signature"
grep -q 'gpgkey=https://mederel.github.io/beelot/beelot.asc' "$repo/rpm/beelot.repo" || fail "the .repo file lacks the key"

# The signature checks out against the published public key alone, in an empty keyring.
verifier=$(mktemp -d "$work/verify.XXXX")
chmod 700 "$verifier"
GNUPGHOME=$verifier gpg --batch --quiet --import "$repo/beelot.asc"
GNUPGHOME=$verifier gpg --batch --quiet --verify "$repo/rpm/repodata/repomd.xml.asc" "$repo/rpm/repodata/repomd.xml" 2> /dev/null \
  || fail "repomd.xml does not verify"

# A passphrase-protected key, as in the workflow: the right passphrase signs, a wrong one fails.
gpg --batch --quiet --passphrase 'right horse' --quick-generate-key 'Beelot locked <locked@example.invalid>' rsa3072 sign never
locked=$(gpg --list-secret-keys --with-colons 'locked@example.invalid' | awk -F: '/^fpr/ { print $10; exit }')
mkdir "$work/locked-site"
APT_GPG_PASSPHRASE='right horse' "$build" "$work/rpms" "$work/locked-site" "$locked" > /dev/null 2>&1 \
  || fail "signing with the right passphrase failed"
GNUPGHOME=$verifier gpg --batch --quiet --import "$work/locked-site/beelot.asc"
GNUPGHOME=$verifier gpg --batch --quiet --verify "$work/locked-site/rpm/repodata/repomd.xml.asc" "$work/locked-site/rpm/repodata/repomd.xml" 2> /dev/null \
  || fail "the passphrase-protected signature does not verify"
gpgconf --kill gpg-agent # it caches the right passphrase
if APT_GPG_PASSPHRASE='wrong' "$build" "$work/rpms" "$work/locked-bad" "$locked" > /dev/null 2>&1; then
  fail "signing with a wrong passphrase succeeded"
fi

# No private key reaches the published tree.
if gpg --show-keys --with-colons "$repo/beelot.asc" | grep -q '^sec'; then
  fail "beelot.asc holds a private key"
fi
if grep -rl 'PRIVATE KEY' "$repo" > /dev/null; then
  fail "a private key block is in the repository"
fi

# dnf installs from it with the signature checked, takes the newest, and an older version stays installable.
reposdir=$work/repos.d
mkdir "$reposdir"
sed -e "s|baseurl=.*|baseurl=file://$repo/rpm|" -e "s|gpgkey=.*|gpgkey=file://$repo/beelot.asc|" \
  "$repo/rpm/beelot.repo" > "$reposdir/beelot.repo"
dnf_opts=(--setopt=reposdir="$reposdir" --disablerepo='*' --enablerepo=beelot -y -q)
dnf "${dnf_opts[@]}" install beelot > /dev/null || fail "dnf install failed"
[ "$(cat /usr/share/beelot/version)" = 1.1.0 ] || fail "dnf did not install the newest version"
dnf "${dnf_opts[@]}" downgrade beelot-1.0.0 > /dev/null || fail "1.0.0 is not installable"
[ "$(cat /usr/share/beelot/version)" = 1.0.0 ] || fail "1.0.0 was not installed"

# The signature protects the index: a tampered repomd.xml is refused.
echo "<!-- tampered -->" >> "$repo/rpm/repodata/repomd.xml"
dnf clean all -q > /dev/null 2>&1 || true
if dnf "${dnf_opts[@]}" makecache > /dev/null 2>&1; then
  fail "dnf accepted a tampered repomd.xml"
fi

echo "ok"
