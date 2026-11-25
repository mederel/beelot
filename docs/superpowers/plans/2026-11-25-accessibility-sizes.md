# Plan: accessibility checks on every screen size (US-207)

Design: `docs/superpowers/specs/2026-11-25-accessibility-sizes-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **Share the screens.** Move the eight screens of the screenshot spec to `e2e/screens.ts`; flag four sizes in `devices.ts`
   (`accessibility: true`), ignore the spec elsewhere in `playwright.config.ts`, and extend `matrix.spec.ts`.
3. **The spec.** `e2e/accessibility.spec.ts`: axe, keyboard, the three media settings, orientation. Add `@axe-core/playwright`.
4. **Source rules.** `tests/source-rules.test.ts`: the manifest's orientation and no orientation lock, with self-tests.
5. **Fix what it finds.** Run the spec on the four sizes; fix the pages (and the reading of the system's motion setting), not the test.
6. **Check.** `npm run check && npm run lint && npm test`; `npm run build` and commit `static/`.
7. **Docs.** `pages/docs/develop.html` mentions what the browser tests now cover.
