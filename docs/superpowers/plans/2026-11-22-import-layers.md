# Plan: untangle the frontend's application layer (US-176)

One pull request, `test:`; no source change.

1. **Check the story against the Svelte code**: cycles (a search over the static imports), layering (grep), shared state (the
   rune stores).
2. **Spec and plan** (this file and the design).
3. **The test** `web/tests/imports.test.ts`: no cycle, no import of a layer above, the scan sees real imports.
4. **Backlog**: the story's Delivered paragraph.
5. **Checks**: `npm run check`, `npm run lint`, `npm test`.
