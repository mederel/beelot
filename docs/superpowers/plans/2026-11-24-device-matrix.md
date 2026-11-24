# Plan: browser tests on the sizes of the devices that exist (US-202)

Design: `docs/superpowers/specs/2026-11-24-device-matrix-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **The list.** `web/e2e/devices.ts` and `playwright.config.ts` building one project per entry; the long round limited.
3. **The matrix test.** `web/e2e/matrix.spec.ts`.
4. **The sweep.** `web/e2e/sweep.spec.ts`; run it, then fix the CSS or exempt with a written reason each size it breaks.
5. **Run** the whole suite on the new projects; fix or justify each finding as in US-201.
6. **Check.** `npm run check && npm run lint && npm test`; `npm run build` and commit `static/` if `src/` changed.
7. **CI.** Update the browser job's comment; shard if the job nears its limit.
