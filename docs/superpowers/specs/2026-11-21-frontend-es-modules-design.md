# Design: load the frontend as ES modules (US-171)

## Goal

Each frontend script imports what it uses and exports what others use, so that the order of the `<script>` tags in `index.html`
stops mattering and tests import the real modules. No bundler, no build step, no dependency, no visual change.

## Decisions

- **Native modules, one tag per file.** Every script stays listed in `index.html`, now as `<script type="module" src="/x.js">`.
  The service worker builds its offline list from those tags (`shellAssets`), so it is unchanged and a module that only other
  modules import is still cached. The content security policy (`script-src 'self'`) is unchanged: a module is an external file.
- **Exports.** The `if (typeof module !== "undefined") module.exports = {...}` line of each script becomes
  `export { ... }`, extended with the names another script uses. The `.cjs` tests still `require()` the files: Node reads a
  `.js` file with `import`/`export` as a module and `require()` loads it (Node 20.19+, 22.12+). `sw.js` stays a classic worker
  script with its `module.exports` guard.
- **Steps that each ship.** Module scripts are deferred, so while some scripts are still classic they get `defer` too, and run in
  the same document order after the modules they read. A temporary `globals-bridge.js` module copies the exports of the
  converted modules onto `globalThis` for the classic scripts; each step shrinks it and the last one deletes it.
  1. Every script that is not an `app*.js` file nor `offline.js` (pure and DOM helpers, `i18n`, `i18n-nl`). `i18n-nl.js` exports
     `dutchLocale({ suitName })` instead of registering itself in `window.beelotLocales`, which removes a load-order contract.
  2. The `app-*.js` files, `app.js` and `offline.js`: cross-file `let` state moves behind functions or one exported state
     object, the startup moves into `start()` called by `app.js`, the bridge and the `defer`s go, and the wiring tests import the
     modules (`app-source.cjs` and the regular expressions over concatenated source are removed).
- **Tests keep their meaning.** A module that used a global `t`, `playSound` or `cardName` now imports it, so a test that stubbed
  the global sets the language through a `window.localStorage` stub and records the sounds by replacing the entries of the
  exported `sounds` object. The number of frontend tests is the same before and after each step (639 at the start).
- **Safe to import in Node.** `i18n.js` translates the static markup only when a page body exists. `telemetry.js`, which a
  deployment loads on demand (`version-label.js`), is injected as a module script and is not part of the bridge.

## Out of scope

A framework, TypeScript, a bundler, any visual change.

## Verification

`node --test crates/beelot-server/frontend-tests/*.cjs` (same count), the Rust checks, and a browser at 375x667 and 1280x800
against a running server: home, solo auction and play, pass-and-play setup, the routes (settings, stats, online lobbies,
tutorial, privacy). The Android app cannot be run where the story was written.
