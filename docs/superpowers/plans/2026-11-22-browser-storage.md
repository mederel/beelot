# Plan: keep the browser's storage in one module (US-194)

One pull request, `refactor:`.

1. **Spec and plan** (this file and the design).
2. **Test first**: `tests/storage/storage.test.ts` (keys, safe stores, `readJson`/`writeJson`, the scan of `src/`, the policy).
3. **The module**: `src/lib/storage.ts`.
4. **The callers**: sfx, haptics, i18n, music, the settings and other stores, the pages, the table's greeting, the API client's
   tokens, and the helpers of the models (`home-status`, `prefs`, `goals`, `account-offer`, `setup-form`).
5. **The privacy policy**: the list of keys in three languages and the new version.
6. **Build** `static/`, **backlog** (Delivered).
7. **Checks**: `npm run check`, `npm run lint`, `npm test`, `npm run build`, `node --test frontend-tests/*.cjs`, and the Rust
   tests that read the policy.
