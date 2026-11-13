# Plan: a dnf repository on GitHub Pages (US-134)

1. `build-rpm-repo.sh` and `test-rpm-repo.sh`.
2. `build.yml`: collect the RPMs and build the repository in the `apt-repo` job; run the test on every pull request.
3. Pages page, README, backlog wording (`gpgcheck`), spec.
4. Pull request (`feat:`), auto-merge, fix what the first CI run finds.
