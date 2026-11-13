# Plan: an Arch Linux package (US-136)

1. `packaging/arch/`: PKGBUILD, sysusers, tmpfiles, `prepare-pkgbuild.sh` (tried locally: parses, fills the checksums).
2. `.github/scripts/test-arch-package.sh`, and the `arch` job in `build.yml`.
3. README section, spec, backlog note.
4. Stacked pull request on the RPM branch; fix whatever the first CI run finds.
