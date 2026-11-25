# Plan: try Beelot on real devices before a release (US-209)

Design: `docs/superpowers/specs/2026-11-25-real-devices-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **The checklist.** `docs/real-devices.md`: the five devices and why, the fifteen-minute steps, what to look for, the record.
3. **The tool.** `real-devices/` with `browserstack-node-sdk` pinned (its own `package.json` and lock): `lib.mjs` (`DEVICES`,
   `browserstackConfig`, `report`), `configure.mjs` (writes `browserstack.yml`), `report.mjs` (prints the record).
4. **Its tests first.** `real-devices/tests/lib.test.mjs` (node --test): the devices, the YAML, the record, the workflow's
   triggers and secret gate, the link from `release.html`. Watch them fail, then write `lib.mjs` and the workflow.
5. **The Playwright config.** `web/playwright.real-devices.config.ts`: `pages.spec.ts` and `key-screens.spec.ts`, no emulated
   size, `bs-local.com:8080`.
6. **The workflow.** `.github/workflows/real-devices.yml` (`secrets` gate, `devices` job, the server started as in
   `ci.yml`'s `browser` job); the new tests in the `lint` job.
7. **Docs.** `pages/docs/release.html`: the checklist, the workflow, the secrets.
8. **Check.** `node --test real-devices/tests/*.test.mjs`, the repository script tests, actionlint, `npm run check && npm run lint`
   in `web/`; then the pull request with the `release-candidate` label, whose run must succeed with `devices` skipped.
