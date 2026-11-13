#!/usr/bin/env python3
"""Fills Beelot's ebuild template (US-138) from Cargo.lock and `cargo metadata`.

Usage: gentoo-ebuild-data.py TEMPLATE CARGO_LOCK METADATA_JSON > beelot-VERSION.ebuild

@CRATES@ becomes one `name-version` line per crate of the registry in Cargo.lock (what cargo.eclass fetches), and
@LICENSES@ the Gentoo names of the licences those crates declare. A crate from anywhere but the registry, or a licence
this script cannot name, is an error: the ebuild must never fetch what Portage does not know.
"""
import json
import re
import sys
import tomllib

REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"

# SPDX identifier -> the name of the file in Gentoo's licenses/ directory.
GENTOO = {
    "0BSD": "0BSD",
    "Apache-2.0": "Apache-2.0",
    "BSD-2-Clause": "BSD-2",
    "BSD-3-Clause": "BSD",
    "BSL-1.0": "Boost-1.0",
    "AGPL-3.0-only": "AGPL-3",
    "AGPL-3.0-or-later": "AGPL-3+",
    "CC0-1.0": "CC0-1.0",
    "CDLA-Permissive-2.0": "CDLA-Permissive-2.0",
    "GPL-2.0-only": "GPL-2",
    "GPL-2.0-or-later": "GPL-2+",
    "GPL-3.0-only": "GPL-3",
    "GPL-3.0-or-later": "GPL-3+",
    "ISC": "ISC",
    "LGPL-2.1-only": "LGPL-2.1",
    "LGPL-2.1-or-later": "LGPL-2.1+",
    "LGPL-3.0-only": "LGPL-3",
    "LGPL-3.0-or-later": "LGPL-3+",
    "MIT": "MIT",
    "MIT-0": "MIT-0",
    "MPL-2.0": "MPL-2.0",
    "OpenSSL": "openssl",
    "Unicode-3.0": "Unicode-3.0",
    "Unicode-DFS-2016": "Unicode-DFS-2016",
    "Unlicense": "Unlicense",
    "Zlib": "ZLIB",
}


def crates(lock_path):
    with open(lock_path, "rb") as f:
        lock = tomllib.load(f)
    lines = []
    for package in lock["package"]:
        source = package.get("source")
        if source is None:
            continue  # a crate of this workspace
        if source != REGISTRY:
            sys.exit(f"{package['name']} {package['version']} comes from {source}, not the crates.io registry")
        lines.append(f"{package['name']}-{package['version']}")
    return sorted(set(lines))


def licenses(metadata_path):
    with open(metadata_path, encoding="utf-8") as f:
        metadata = json.load(f)
    names = set()
    unknown = {}
    for package in metadata["packages"]:
        if package.get("source") is None:
            continue
        expression = package.get("license")
        if not expression:
            sys.exit(f"{package['name']} {package['version']} declares no licence")
        # Every identifier of the expression is listed (a superset of what applies): "OR" and "AND" and the
        # old "/" separator all mean "list it", and an exception after WITH is not a licence of its own.
        tokens = re.split(r"[\s/()]+", expression)
        skip = False
        for token in tokens:
            if not token or token in ("AND", "OR"):
                continue
            if token == "WITH":
                skip = True
                continue
            if skip:
                skip = False
                continue
            token = token.removesuffix("+")
            if token not in GENTOO:
                unknown.setdefault(token, f"{package['name']} {package['version']}")
                continue
            names.add(GENTOO[token])
    if unknown:
        # All of them at once, so one run shows everything to add.
        sys.exit("no Gentoo name for the licences: " + ", ".join(f"{k} ({v})" for k, v in sorted(unknown.items())))
    return sorted(names)


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    template, lock, metadata = sys.argv[1:]
    with open(template, encoding="utf-8") as f:
        text = f.read()
    text = text.replace("@CRATES@", "".join(f"\t{c}\n" for c in crates(lock)))
    text = text.replace("@LICENSES@", " ".join(licenses(metadata)))
    sys.stdout.write(text)


if __name__ == "__main__":
    main()
