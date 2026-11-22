# Design: make repeat page loads cheap (US-191)

## Starting point

The build wrote fixed names (`app.js`, `app.css`, `chunks/*.js`, `assets/*`) and the server answered every file with
`Cache-Control: no-cache`, so a second visit asked the server again for each of them (a 304 each), and the service worker did
the same on top (`fetch(..., { cache: "no-cache" })`, the kept copy only for offline). The story, written before the redesign,
proposed hashing in the server or in a release script, "no bundler"; Vite is the bundler now and hashes names itself.

## Figures (second load, one Chromium profile, 375x667, Fast 3G emulation, service worker active)

Measured with `Network.emulateNetworkConditions` against a small Node server that gives the files the Rust server's cache
headers and ETags and counts what reaches it (the real server needs MariaDB, which this host cannot start; the Rust tests
below check the headers themselves).

| | before | after |
| --- | --- | --- |
| Requests that reach the server for the page's own files (`/`, script, chunk, stylesheet, language, 2 fonts) | 7, all revalidated (7 x 304) | 1 (`/`, 304) |
| Requests in all, with the page's 3 API calls | 10 | 4 |
| Bytes of the page's files received on the second load | 0 (but 7 round trips of 150 ms each) | 0 (1 round trip) |

## Decisions

- **Vite names every file after its content**: `assets/app-HASH.js`, `assets/NAME-HASH.js` for chunks (the language
  dictionaries, the telemetry), `assets/style-HASH.css`, `assets/NAME-HASH.woff2` (eight characters of `A-Za-z0-9_-`). The
  build stays deterministic, so CI's "the build matches `static/`" check still holds. `index.html` names the new files.
  `index.html`, `sw.js`, the manifest, the icons, the privacy policy and the music are copied as they are and keep their names.
- **The server marks `/assets/*` immutable** (`public, max-age=31536000, immutable`) for a 200 or a 304, in a small middleware
  inside the existing `no-cache` layer (which leaves a header that is set). A 404 under `/assets/` is not kept. Everything
  else stays `no-cache`. The content security policy is not touched.
- **The service worker keeps the guarantee of the current one** (a new version is seen on the next load, never a new page with
  old scripts) by serving only the files whose name carries a hash from its cache first; the page, the manifest and the other
  files are still asked from the server every time (network first, the kept copy only offline). A new page always names new
  files, which are fetched once and kept; the cache's name still changes with the content of the build, so a new build throws
  the old copies away. The precache list follows the new names because it is built from the bundle.
- **Images** are the icons and the favicon in `public/`, which the manifest and the page name with fixed paths and which other
  places (the Android app, the install prompt) read: they keep revalidating (a 304 each, and only when the browser asks for them).
  The page's own pictures are inline SVG.
- **One edge case, accepted:** a page that stays open across a release and then loads a lazy chunk of the old build (the
  dictionary of a language chosen later) asks for an old name the server no longer has. Before, it got the new file under the old
  name, which is worse. The player reloads.
- **Changed tests:** the Rust tests that read `/app.js` and `/app.css` by name read `index.html` for the names; the test that
  listed `/app.js` and `/app.css` among the revalidated files lists the files that keep their names, and a new one checks the
  hashed files; the vitest tests of the built page read the hashed names; `test-container.sh` finds the telemetry chunk in the
  service worker's list. ADR-007 is amended.

## Tests

- `crates/beelot-server/tests/skeleton.rs`: every file under `static/assets` has a hashed name and is served with the immutable
  header; `index.html` names built files; the files that keep their names answer `no-cache`; a missing name under `/assets/` is
  a 404 with `no-cache`; the security headers are unchanged on the script.
- `web/tests/service-worker.test.ts` runs the built `sw.js` against a fake cache and network: a held hashed file is served
  without the network; a new one is fetched once and kept; the page, the manifest, the icons and the policy are asked from the
  server with `no-cache`; the API and the music are left to the browser.
- `web/tests/page.test.ts`: the built page names hashed files, and the shell lists them.
