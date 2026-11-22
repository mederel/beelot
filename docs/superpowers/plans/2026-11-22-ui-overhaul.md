# A complete redesign of the look, the motion and the sound: implementation plan (US-172)

Design: `docs/superpowers/specs/2026-11-22-ui-overhaul-design.md`. Decision: `docs/adr/007-svelte-frontend.md`.

1. **The project.** `crates/beelot-server/web/`: `package.json` (Svelte 5, Vite, TypeScript, Tailwind CSS 4, Vitest,
   `@lucide/svelte`, Fontsource fonts), `vite.config.ts` writing `../static/` with fixed names, `tsconfig.json`,
   `svelte.config.js`. `web/public/` takes the files copied as they are: `privacy-policy.json`, `music/`, the icons,
   `manifest.webmanifest`. The Rust code that reads `static/privacy-policy.json` keeps reading it there (the build copies it).
2. **The logic, in TypeScript.** The pure modules move to `web/src/lib/` with types for the snapshots
   (`api/types.ts`, from `tests/contract/*.json`): router, i18n and the message texts, auction sheet, lobby model, contract
   badge, score bar, table status, table chips, home status, setup form, goals, account offer, theme, pace, effects,
   celebrations, match end and round review models, bot characters, lines, reactions and expressions, card physics, game
   events, table events, reconnect, toast, code boxes, friends, daily, leaderboard, rating, privacy policy, version,
   telemetry. Their tests are ported to Vitest with them.
3. **The design system.** Tokens and themes in `app.css` (Tailwind's `@theme`), the fonts, and the components: buttons,
   glass panels, sheets on `<dialog>`, segmented choices, switches, the playing card and its back, suit glyphs, avatars, the
   hexagon chip. The sound engine (`audio/sfx.ts`), haptics, and the particle bursts (`fx/particles.ts`, a canvas).
4. **The shell.** `App.svelte`: the router with view transitions, the dock and the rail, the banners, the live regions, the
   settings store (the same `beelot.*` keys), the account store, friends polling.
5. **The pages.** Home, setup sheet, crew, public, tutorial, rules and help sheet, statistics, leaderboard, settings with the
   passkeys and your data, privacy.
6. **The table.** `table/controller.svelte.ts` holds the snapshot, the paced sequence of what the player sees (deal, calls,
   cards, trick collection, round end) and the actions; the components draw it: header, seats, trick, hand, auction sheet,
   lobby sheet, round result, chips and toasts, reactions, hand-off, leave dialog, match end, round review. The stream and its
   reconnection for online tables.
7. **The service worker and the app.** `sw.js` keeps the offline shell (network first) with the new file list; the manifest,
   the icons (a new mark: the bee in a honey hexagon), maskable icons, and the Android app's background colour.
8. **Tests and CI.** Vitest for the models and the components; a test of the built page against the CSP; the repository
   tests that are not about the page stay in `frontend-tests/`. The `check` job gets Node 22, `npm ci`, the type check,
   the tests, the build and the check that `static/` matches. The old page's source tests go with the old page.
9. **Checks.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `npm test`,
   `npm run check`; in a browser with the server's policy at 375×667 and 1280×800, in English, French and Dutch: home, setup,
   a solo round from the deal to the round result and the review, a match end, pass-and-play, a private table from the
   lobby to the auction, a public quick match, the crew page, the tutorial, the statistics as a guest, the settings and the
   sign-in panel, offline.
10. **Docs.** README (the look, the screenshots, how to build the frontend), the backlog's Delivered note of US-172.
