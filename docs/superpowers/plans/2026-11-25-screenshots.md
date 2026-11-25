# Plan: compare screenshots of the key screens (US-205)

Design: `docs/superpowers/specs/2026-11-25-screenshots-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **The spec.** `web/e2e/screenshots.spec.ts` and its config `web/playwright.screenshots.config.ts`; the main config ignores it.
3. **The wrapper.** `.github/scripts/screenshots.sh`: Playwright's image of the version in `package.json`, `--update-snapshots`
   passed through.
4. **The images.** Generate them with the wrapper; check they are stable (two runs, no diff) and under 20 MB.
5. **The test.** `web/tests/screenshots.test.ts`: exact version, wrapper, completeness, weight.
6. **CI.** The `screenshots` job, in the `ci` job's `needs`; the deliberate-difference step; `ci-gate.test.cjs` follows.
7. **Docs.** `pages/docs/develop.html`: how to run, regenerate and approve.
8. **Check.** `npm run check && npm run lint && npm test`, the CI script tests, `npm run build` (no change of `static/` expected).
9. **Pull request** with auto-merge.
