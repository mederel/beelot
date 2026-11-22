# Design: keep the browser's storage in one module (US-194)

## Starting point

Since the Svelte redesign (US-198) the page keeps 18 names under `beelot.*` in `localStorage` (the language, the sound, music,
vibration, theme, effects, pace, reactions and bot comments switches, the unlocked themes, the tutorial flag, the goals'
ledger, the account offer, the resume records, one setup per mode, and two keys of earlier versions) and three in
`sessionStorage` (the player tokens of the tab's tables, the private table session, the greeted games). They were spelt out in
a dozen files, each with its own `try/catch`, some of them (`sfx`, `haptics`, `i18n`, `settings`) calling `localStorage`
directly, and the pages passing `localStorage` to the helpers of the models. The privacy policy's list was out of date: it named
`beelot.legacy-table`, which no code uses, and "the resume card", and left out most of the keys.

## Decisions

- **`src/lib/storage.ts` owns the names**: `KEYS` (device), `setupKey(mode)`, `SESSION_KEYS` (this tab). The values are exactly
  the names that were in use, so what players already stored is read as before; a test pins the list.
- **`local` and `session` are safe stores** (`getItem`, `setItem`, `removeItem`): they look the browser's storage up at each
  use and never throw. A disabled storage reads as empty; a refused or full write is ignored, so the choice lasts for the page.
  `readJson(store, key, fallback, valid?)` and `writeJson(store, key, value)` (false when the write was refused) are the typed
  reads and writes the models use for their JSON values.
- **The helpers of the models keep their shape** (`readResume(storage)`, `loadSetup(storage, mode)`, ...) so that their tests
  can still pass a stand-in; they take a `Store` and the pages pass `local`. Their repeated `try/catch` around `JSON.parse`
  became `readJson` and `writeJson`. Their exported key constants (`RESUME_KEY`, `OFFER_KEY`, ...) are now the module's keys.
- **No other file** names `localStorage` or `sessionStorage`, or writes a `beelot.*` key (comments apart): a test reads `src/`.
- **The privacy policy** is corrected, in the three languages, to name every key of the module (the device's, the two earlier
  keys, the setup per mode and the session's), and its version moves to the date of the change, as the policy itself says it
  must. A test fails when the module has a key the policy does not name, or the policy names one the module lacks.
- **The player tokens stay where they were** (US-195 records why).
- **Not changed**: the cookies (set and read through `csrf.ts`), the service worker's cache, the Android app's storage.

## Tests

`tests/storage/storage.test.ts`: the keys are unique `beelot.*` names and equal the list of the names already stored; the
stores read and write the browser's storage; a storage that throws on every call (disabled), one that is full and no storage
at all read as empty and ignore writes; `readJson` gives the fallback for a missing, corrupt or invalid value and `writeJson`
reports a refused write; `src/` has no `localStorage`, `sessionStorage` or `beelot.*` string outside the module; the policy and
the module name the same keys in English, French and Dutch. The existing tests of the models, the settings and the table still
pass unchanged.
