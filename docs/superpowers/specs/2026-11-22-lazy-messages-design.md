# Load only the player's language (US-192)

## Finding

US-198 already loads the French and the Dutch dictionaries (`fr.ts`, `nl.ts`) with `import()` for the language in use. What
stayed in the main script are the texts of the server's codes (US-170) in all three languages (`messageTexts` in
`messages.ts`): about 13 KB of French and Dutch that a player never reads in the other language.

## Design

- `messages.ts` keeps `englishMessages` only: English is the fallback and has no dictionary.
- `fr.ts` exports `frMessages` and `nl.ts` exports `nlMessages`, next to their dictionary.
- `loadLanguage` imports the module once and keeps the dictionary and the messages in the language's `Locale`.
- `renderMessage` reads the messages of the language; before it is loaded it answers `null`, and `localized` shows the English
  sentence the server sent with the code. `main.ts` and `setLanguage` load the language before the page shows, so this only
  covers a text asked for another language than the page's.
- The offline shell is unchanged: the service worker's precache lists every chunk of the build, so both languages stay cached.

## Figures (main script)

Before: 343,060 bytes, 111,983 gzipped. After: 329,491 bytes, 108,287 gzipped. The 115 KB of the story was written for the
old single-file page; the dictionaries were already split by US-198.

## Tests

`tests/i18n/lazy-messages.test.ts`: a language has no text before it is loaded and loading one leaves the other alone; the built
main script holds no French or Dutch text of a code. `message-codes.test.ts` loads the languages and still fails for a code
missing in one.
