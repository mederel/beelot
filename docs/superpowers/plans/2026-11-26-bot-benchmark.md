# Plan: report how the bots play on every pull request (US-211)

Design: `docs/superpowers/specs/2026-11-26-bot-benchmark-design.md`. Issue: #503.

1. **Spec and plan.** Commit the design and this plan.
2. **The flag.** `ci-changes.sh` prints `bots`; `ci-changes.test.cjs` follows (`ALL` and `NONE` gain the key).
3. **The summary script.** `.github/scripts/arena-summary.mjs` with its test `arena-summary.test.cjs`: written test first.
4. **The job.** `bots` in `ci.yml`: base worktree, two release builds, two runs, the script, the sticky comment, the artifact, the
   job summary; added to the `ci` job's `needs`, the header diagram and `ci-gate.test.cjs`.
5. **Docs.** `pages/docs/arena.html` (the comment and how to reproduce it), `pages/docs/develop.html` if it lists the jobs.
   The improvement ideas page says the item is done.
6. **Check.** `node --test` of the scripts, `cargo fmt --check`, clippy, actionlint when available, a local dry run of the job's
   commands against `HEAD~1`.
7. **Pull request** `feat: report how the bots play on every pull request that changes them (US-211)`, `Closes #503`, auto-merge.
