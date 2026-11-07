# Install the game and play it with a keyboard or screen reader (US-073, US-074)

## Install and offline (US-073)

- `manifest.webmanifest`: standalone display, start URL `/`, 192 and 512 PNG icons drawn from `favicon.svg`, theme
  colour `#071a20`. `index.html` links it, adds `theme-color` and an apple touch icon.
- `sw.js`, served from the root so its scope is the whole site:
  - install: fetch `/` and read the scripts, styles and icons it names (`shellAssets`), so a new script is never
    forgotten in a hand-kept list;
  - navigation: network first, fall back to the cached `/`; the single page then renders the rules and tutorial
    routes by itself;
  - other same-origin GET files: stale while revalidate;
  - `/api/` and other origins are never cached (`cacheable`); old cache names are deleted on activate.
- `offline.js` registers the worker and shows `#offline-note` (`role="status"`) while `navigator.onLine` is false:
  games need a connection, the rules and the tutorial still work.
- Texts exist in French and Dutch.

## Keyboard and screen reader (US-074)

- `game-events.js` (pure, tested in Node) compares two views of a table, `auctionView` or `playView`, and returns
  events: call, card, trick won, round result, match won. The first rendering and a change of kind return nothing, so
  opening a game halfway is silent.
- `app-announce.js` writes the events into `#game-live` (polite live region). `renderSolo` and `loadAuction` feed it.
- A skip link moves focus to `main`; a global `:focus-visible` outline covers controls and cards. Legal hand cards were
  already focusable, illegal ones are `aria-disabled`.
- Audit: a Chrome script checks the main screens for unnamed controls, images without a name, duplicate ids, language
  and landmarks; none found.

## Not covered

Solo games need the server, so they are not playable offline. The tutorial and rules are, because they are static
screens of the shell.
