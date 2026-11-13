# Plan: an RPM package (US-133)

1. Phase 13 in the backlog: US-133 to US-137, one package format per story.
2. `packaging/rpm/beelot.spec`, `build-rpm.sh`.
3. `check-rpm.sh` and `test-rpm-install.sh`.
4. `build.yml`: build, check and install on every pull request; build, check and attach to the release.
5. README section, spec, backlog note; PR (`feat:`), auto-merge, then fix whatever the first CI run finds.
