# Plan: remove files that should not be in the repository (US-197)

One pull request, `ci:`.

1. **Spec and plan** (this file and the design).
2. **Test first**: `frontend-tests/repo-hygiene.test.cjs` (the check on scratch repositories, on this repository, the ignore
   rules, the workflow step).
3. **The change**: `git rm --cached` the cache and `.idea/`, ignore them, add `check-no-build-leftovers.sh` and its step in the
   `check` job.
4. **Backlog**: the story's "Delivered" paragraph.
5. **Checks**: `node --test crates/beelot-server/frontend-tests/*.cjs`, `cargo fmt --check`.
