# Plan: keep the player token safe in the page (US-195)

One pull request, `test:`.

1. **Spec and plan** (this file and the design), with the record of where the tokens are kept.
2. **Test first**: `tests/source-rules.test.ts`.
3. **The lint rule**: `lint/no-html-sinks.grit` and the `plugins` entry of `biome.json`; checked on a scratch file.
4. **Backlog**: the story's Delivered paragraph, with the decision marked as pending the product owner.
5. **Checks**: `npm run check`, `npm run lint`, `npm test`, `npm run build` (no change of `static/` expected),
   `node --test frontend-tests/*.cjs`.
