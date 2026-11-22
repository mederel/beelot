# Plan: load only the player's language (US-192)

One pull request, `perf:`.

1. Spec and plan (this file and the design).
2. Tests first: `lazy-messages.test.ts`; `message-codes.test.ts` loads the languages and reads the texts of each module.
3. Move the French and Dutch texts of the codes to `fr.ts` and `nl.ts`; `loadLanguage` and `renderMessage` follow.
4. `npm run build`: `static/` rebuilt; figures before and after.
5. Backlog (Delivered). Checks: `npm run check`, `lint`, `test`, `build`.
