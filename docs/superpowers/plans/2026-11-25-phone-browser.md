# Plan: what a phone's browser does to the page (US-206)

Design: `docs/superpowers/specs/2026-11-25-phone-browser-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **Source rules.** `tests/source-rules.test.ts`: no `vh` length, `viewport-fit=cover`, no disabled zoom, each with a self-test.
3. **The browser spec.** `web/e2e/phone-browser.spec.ts`: the insets, the keyboard, the bars and the rotation, with the self-test of
   the inset check. Run it on every Chromium project; add it to the WebKit and Firefox sets of `devices.ts`.
4. **Fix what it finds.** Safe-area padding at the sides, the auction's reserve, the form that stays in view, `vh` to `dvh`.
5. **Check.** `npm run check && npm run lint && npm test`; `npm run build` and commit `static/`.
6. **Docs.** `pages/docs/develop.html` mentions what the browser tests now cover.
