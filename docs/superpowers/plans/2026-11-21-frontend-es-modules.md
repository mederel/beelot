# Plan: load the frontend as ES modules (US-171)

Two pull requests, both `refactor:`; each leaves the four commands green and the page working.

## Step 1: the scripts outside the `app*` files

1. Record the baseline: 639 frontend tests.
2. `i18n-nl.js` exports `dutchLocale`; `i18n.js` imports it and no longer reads `window.beelotLocales`.
3. Every script but `app*.js`, `offline.js` and `sw.js`: drop the `module.exports` guard, add `import` lines for the names taken
   from other converted scripts, and `export { ... }` for the names used elsewhere.
4. `globals-bridge.js` (imports every export, assigns it to `globalThis`) placed before the first classic script; classic scripts get
   `defer`; `index.html` tags of converted scripts become `type="module"`.
5. Tests: script-tag expectations, `app-source.cjs`'s tag pattern, and the tests that stubbed `t`, `playSound`, `cardName` for a
   module that now imports them.
6. Safe loading in Node and in the page: `i18n.js` guard, `telemetry.js` injected as a module and kept out of the bridge.
7. Check in a browser; run the commands; open the pull request.

## Step 2: the `app*` files

1. Find the writes to another file's `let` (analysis of assignments) and give each an owner with a setter.
2. Convert the files in dependency order with explicit imports; `start()` in `app.js`.
3. Replace each `appSource()` assertion by an assertion on the imported module; delete `app-source.cjs`.
4. Delete `globals-bridge.js` and the `defer`s; check the page again, including the sign-in and the Android app.
