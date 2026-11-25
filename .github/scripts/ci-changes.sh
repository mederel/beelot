#!/usr/bin/env bash
# Prints what a change makes the ci workflow run, as `flag=true|false` lines for $GITHUB_OUTPUT, from the changed files
# read on stdin, one a line.
#
#   code     anything but documentation (docs/ and Markdown): lint runs
#   rust     the Rust crates, the lock, the toolchain, the fixtures: the Rust tests, the builds, the browser tests, Arch
#   web      the frontend's sources and its built files: the frontend's checks, the Rust tests (they serve static/), the
#            builds and the browser tests
#   pkg      the packaging, the CI scripts and the Lighthouse run: the builds, the packages, the stack, Arch
#   android  the Android app
#   gentoo   the ebuild, its scripts or the crates it lists (it takes long to try)
#
# A change to the workflows or their actions runs everything, and so does an empty list (a diff that could not be
# computed). On a push to main every flag but gentoo is `code`: a release rests on every check.
#
# Usage: ci-changes.sh EVENT < changed.txt   (EVENT is github.event_name)
set -euo pipefail

event=${1:?usage: ci-changes.sh EVENT < changed.txt}
changed=$(grep . || true)

if [ -z "$changed" ]; then
  for name in code rust web pkg android gentoo; do echo "$name=true"; done
  exit 0
fi

files=$(grep -vE '(^docs/|\.md$)' <<<"$changed" || true)
has() { grep -qE "$1" <<<"$files"; }
flag() { if "$@"; then echo true; else echo false; fi; }
# The crate's frontend and the repository's script tests live under crates/ but are not Rust.
rust_files() { grep -vE '^crates/beelot-server/(web|static|frontend-tests)/' <<<"$files" | grep -qE '^(crates/|Cargo\.(toml|lock)$|rust-toolchain\.toml$|fixtures/)'; }

code=$(flag has .)
rust=$(flag rust_files)
web=$(flag has '^crates/beelot-server/(web|static)/')
pkg=$(flag has '^(packaging/|lighthouse/|\.github/scripts/|compose\.yaml$)')
android=$(flag has '^android/')
gentoo=$(flag has '^(packaging/gentoo/|\.github/scripts/(prepare-ebuild\.sh|gentoo-ebuild-data\.py|test-gentoo-ebuild\.sh)|Cargo\.lock$)')
ci=$(flag has '^(\.github/(workflows|actions)/|\.github/actionlint\.yaml$|\.node-version$)')

if [ "$ci" = true ]; then
  rust=true web=true pkg=true android=true gentoo=true
elif [ "$event" = push ] && [ "$code" = true ]; then
  rust=true web=true pkg=true android=true
fi

echo "code=$code"
echo "rust=$rust"
echo "web=$web"
echo "pkg=$pkg"
echo "android=$android"
echo "gentoo=$gentoo"
