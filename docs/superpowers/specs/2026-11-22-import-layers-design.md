# Design: untangle the frontend's application layer (US-176)

## Where the redesign left it

The story, written for the old `app*.js` files with module-level variables shared in `index.html`'s script order, asked for one
state module, one-way imports, no cycle, a test that keeps it so, and no visible change, screen by screen. The Svelte rewrite
(US-198, ADR-007) replaced those files, and most of the story is satisfied by its structure:

- **State** lives in rune stores under `web/src/lib/stores/` (`account`, `connection`, `friends`, `goals`, `live`, `notices`,
  `router`, `settings`, `sheets`), each with named reads and changes, and in `table/game.svelte.ts` for what the table shows.
  The one module-level variable another module reads is the API client's `streamDropped`, which has a setter
  (`watchStreamDrop`) and a getter used only inside the client.
- **No script order**: `main.ts` imports what it uses; there is no `index.html` list of scripts.
- **No cycle** among the 94 source files (checked while writing this: a depth-first search over the static imports gave 0).
- **The direction** is views (`pages`, `shell`, `lib/ui`, `lib/brand`), then the table's controller (`table`), then the API,
  the stores, the sound and the effects, then the models (`lib/models`, `lib/i18n`, `lib/cards`, `lib/avatars`), which import
  none of the above.
- "Screen by screen, no visible change", "a framework, TypeScript, a bundler" are moot: the whole page was rewritten under
  its own verification (US-198's Delivered paragraph).

## What was missing: the test that keeps it so

`modules.test.cjs` no longer exists, so nothing failed when a cycle or an upward import came back. `web/tests/imports.test.ts`:

- reads the static imports of every `.ts` and `.svelte` file (not `import type`, erased by the build, nor `import()`, which is
  lazy) and fails for a cycle, printing it;
- fails when a layer imports one above it: the models, i18n, cards and avatars import none of the stores, the API, the UI, the
  pages, the shell or the table; the API, stores, sound and effects import none of the UI, pages, shell or table; the table's
  controller imports none of the pages or the shell;
- allows one pure leaf, `lib/api/csrf.ts` (US-193), which the telemetry model uses and which imports nothing (the test checks
  that), and checks that its scan sees real imports (the API client's use of the connection store, the table's use of the client).

It passes on today's sources: there was nothing to untangle, so the pull request changes no source and no `static/`.

## Not verified

The story's browser check at 375x667 and on a desktop width is the redesign's (it lists the screens it verified); nothing
visible changes here.
