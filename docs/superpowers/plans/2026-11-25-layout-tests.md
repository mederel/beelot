# Plan: document how to test a screen's layout and add a device (US-210)

Design: `docs/superpowers/specs/2026-11-25-layout-tests-design.md`.

1. **Spec and plan.** Commit the design and this plan.
2. **The test first.** In `crates/beelot-server/frontend-tests/site.test.cjs`: the page is linked from the index, `develop.html`
   and AGENTS.md, names US-201 to US-209, has the story's sections, and every repository path it names exists. Watch it fail.
3. **The page.** `pages/docs/layout-tests.html`, with the costs measured on the last `main` run (blob reports summed per spec
   and per project, the `screenshots` and `lighthouse` jobs' wall-clock).
4. **The links.** The "Layout tests" entry in the shared navigation of every docs page, a card in `docs/index.html`, two links
   from `develop.html`, the README's list of docs pages.
5. **AGENTS.md.** The bug-fix rule for a layout bug: its viewport in the matrix or its screen in the layout checks, with the
   page's path.
6. **Check.** `node --test crates/beelot-server/frontend-tests/*.cjs`; open the page in a browser at 375 px and at desktop
   width; then the pull request (`feat:`, `Closes #465`) with auto-merge.
