# Plan: layout checks in the browser tests (US-201)

Design: `docs/superpowers/specs/2026-11-24-layout-checks-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **Helper and its self-test first.** `web/e2e/layout.ts` (`expectLayout`, `findLayoutViolations`, exemptions) and
   `web/e2e/layout.spec.ts`: a page that overflows, clips, overlaps and has a small target; a page that fits; an exemption.
   Run it on the five projects.
3. **Mock the server.** `web/e2e/mock.ts`: the recorded snapshots of `tests/contract/` and the account, served from the page's
   side; `partner-seat.spec.ts` uses it instead of its own routes.
4. **Existing tests use the helper.** `pages.spec.ts` (every route), `auction-layout.spec.ts` (the hand and the panel) and
   `partner-seat.spec.ts` (the table with the badge; the centre-line assertion stays).
5. **Key screens.** `web/e2e/key-screens.spec.ts`: the screens of the story, each driven to its state.
6. **Run, then fix or justify each finding.** Collect every violation on the five projects; fix the CSS where the layout is
   wrong, refine the helper where the finding is not a fault (overlays, fixed bars, scrolled-out parts), exempt with a written
   reason where neither applies.
7. **Check.** `npm run check && npm run lint && npm test`, then `npm run e2e` against the server (CI does this).
8. **Build.** `npm run build`; commit the rebuilt `crates/beelot-server/static/`.
