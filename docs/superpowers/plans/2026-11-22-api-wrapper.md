# Plan: call the API through one wrapper (US-193)

One pull request, `refactor:`.

1. **Spec and plan** (this file and the design).
2. **Tests first**: `one-wrapper.test.ts`, `response.test.ts`, two page tests in `app.test.ts`; they fail on the current code.
3. **The wrapper**: `csrf.ts`; `send` and `withRetries` in `client.ts`; `apiJson` and the new `apiResponse` on them; the
   telemetry uses `csrfToken`.
4. **The callers**: Settings (export, delete), the account store (ceremony, sign-out), Leaderboard, Stats, Home, Privacy.
5. **Build**: `npm run build`, commit `static/`.
6. **Backlog**: the story's Delivered paragraph.
7. **Checks**: `npm run check`, `npm run lint`, `npm test`, `npm run build`, `node --test frontend-tests/*.cjs`.
