# US-117 — A tab bar: design

Status: proposed. Story: `docs/product-backlog.md`, Phase 8. Context: sections 4 and 6 of
`2026-11-06-ui-refactor-wireframes-design.md`. Builds on US-116 (`router.js`, `sheet.js`).

## 1. Goal

A tab bar with four tabs, Play, Crew, Progress and Me, so a player moves between playing, private tables, results and
settings without going back to a menu. It sits at the bottom on phones and at the top from 1024px, and is hidden during
a match. Existing views are mounted inside the tabs unchanged.

## 2. Today

- Thirteen views (`data-view`). The only global navigation is the logo link and a top "Settings" link
  (`.settings-link`, with an `aria-current` rule in `renderView`, CSS, and rules that hide it on match screens).
- `routeFor` (US-116) returns `tab: null` for every route; the field was kept for this story.
- The home page also holds the sign-in panel and the mode cards; they stay there until US-122 and US-124.
- None of the labels `Play`, `Crew`, `Progress`, `Me` or `Main` is in `i18n.js` or `i18n-nl.js`.
- `icons.svg` holds one icon (the dealer chip), too little for four tabs.

## 3. Decisions

1. **Tab per route, set in the route table.** The router, not the DOM, says which tab a route belongs to.
2. **Crew lands on `/online/private`.** The private-table view is the only one that is "create or join a table".
   Find a game (`/online/public`) keeps the Crew tab highlighted but stays reachable from the Play tab's mode cards
   until US-124 merges both into one Crew screen. No existing view changes. (Decided with the product owner.)
3. **Plain links, no new mechanism.** Each tab is an `<a href>`; the existing click handler already sends it through
   `navigate()`.
4. **One element for both layouts.** The same `<nav>` is a bottom bar on phones and a top navigation from 1024px;
   only CSS differs.
5. **Suit glyphs as icons.** ♠ Play, ♥ Crew, ♦ Progress, ♣ Me, as `aria-hidden` text next to the label. No new
   asset, and it matches the game's look.
6. **The top "Settings" link is removed.** The Me tab replaces it.

## 4. Routing

`router.js` gets the data and `routeFor` fills `tab`:

| Tab | Routes |
|---|---|
| `play` | `/`, `/index.html`, `/play/bot`, `/play/local`, `/tutorial`, `/rules` |
| `crew` | `/online/private`, `/online/public` |
| `progress` | `/stats` |
| `me` | `/settings`, `/privacy` |
| none (`null`) | the id routes: `/play/bot/game/:id`, `/play/bot/bidding/:id`, `/online/{private,public}/table/:id` |

An unknown path falls back to home and therefore to the `play` tab. `sheet` stays `null`.

```
const tabs = [
  { id: "play", label: "Play", href: "/", glyph: "♠" },
  { id: "crew", label: "Crew", href: "/online/private", glyph: "♥" },
  { id: "progress", label: "Progress", href: "/stats", glyph: "♦" },
  { id: "me", label: "Me", href: "/settings", glyph: "♣" }
];
```

`tabs` is exported from `router.js`. The markup is written to match it and a test keeps them equal.

## 5. The bar

- `<nav class="tab-bar" id="tab-bar" aria-label="Main">` inside `<main class="shell">`, after the views, holding four
  links: `<a class="tab" href=… data-tab=…><span class="tab-glyph" aria-hidden="true">♠</span><span class="tab-label">Play</span></a>`.
- `renderView` reads `routeFor(location.pathname).tab`. A `null` tab sets `hidden` on the nav; otherwise it clears
  `hidden` and sets `aria-current="page"` on the matching link and removes it from the others.
- The nav is `hidden` on the match screens (`bot-game`, `bidding`, `private-table`), including the online table
  before the deal. Moving the lobby onto the table is US-121.
- The labels pass through the existing translation of static text, like the other labels in `index.html`.
- Each tab is at least 44px high and wide enough to tap; the current tab is a gold sticker with an underline, like the
  old settings link was.

## 6. Layout and CSS

- **Phone:** the bar is `position: fixed` to the bottom with `padding-bottom: env(safe-area-inset-bottom)`, a paper
  sticker with the card outline and hard shadow (US-100). The shell gets bottom padding equal to the bar so the last
  content is never covered.
- **From 1024px:** the same nav is a static top navigation: `position: static`, in a row beside the logo, no bottom
  padding on the shell.
- The `.settings-link` rules (base, hover, `aria-current`, focus-visible, the three match-screen hiding rules) are
  deleted; the matching `settingsLink` code in `renderView` goes too.
- Colours use the existing tokens (`--card-paper`, `--card-ink`, `--gold`); contrast is checked in every table theme
  (US-087). Reduced and Off effects (US-094) add no motion; the bar has none to start with.
- A dialog or sheet open over the page stays above the bar (the top layer already guarantees it).

## 7. Texts

New English texts, translated into French and Dutch in `i18n.js` and `i18n-nl.js`: `Play`, `Crew`, `Progress`, `Me`
and `Main` (the nav's accessible name). French and Dutch wording is proposed (Jouer, Équipe, Progrès, Moi,
Principale; Spelen, Team, Voortgang, Ik, Hoofdmenu) and flagged for native review in the pull request.

## 8. Files

- Changed: `static/router.js` (`tabs`, `routeFor`), `static/index.html` (nav, the Settings link removed),
  `static/app.js` (`renderView` sets the bar, the `settingsLink` code removed), `static/styles.css`, `static/i18n.js`,
  `static/i18n-nl.js`.
- New tests in `frontend-tests/router.test.cjs` and a new `frontend-tests/tab-bar.test.cjs`. Existing tests that
  mention the Settings link are updated.
- Not changed: the Rust code, the API, the CSP, the existing views.

## 9. Tests and checks

- **Router tests.** Every route in section 4 returns its tab; the id routes return `null`; an unknown path returns
  `play`; `tabs` has four entries in the order Play, Crew, Progress, Me with the hrefs above, and every `href` is a
  known route.
- **Wiring tests.** `index.html` has the nav with `aria-label="Main"` and four links equal to `tabs`; the Settings link
  is gone and no CSS or JS refers to `.settings-link`; the French and Dutch entries exist for all five texts.
- **Existing tests.** All current tests pass, including the ones that read `index.html`.
- **Browser checks** (Chrome) at 375×667 and 1280px, with Reduced and Off effects: the bar is shown on home, Crew,
  Progress and Me; it is hidden on a bot match, the bidding view, a pass-and-play match and an online table, and is
  back after leaving; the current tab is announced (`aria-current`); back and forward move the highlight; tab targets
  measure at least 44px; no content sits under the bottom bar on any tab view; contrast in the four table themes.
  Safari is listed as unverified if it cannot be run.
- **Repository gates.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`
  (Docker for the MariaDB tests).

## 10. Risks

- **Bottom bar over content.** A fixed bar can hide the last button on a long page. Mitigation: shell padding equal
  to the bar height, and a browser check on each tab view at 375×667.
- **Landscape phones.** A bottom bar costs height. The bar is hidden on match screens, the only place height is tight;
  other screens scroll.
- **Translations.** The French and Dutch words are mine and need a native check.
- **Crew is thin until US-124.** It shows private tables only; find a game stays on the Play tab. The pull request
  says so.

## 11. Out of scope

Moving the sign-in panel, the mode cards or the goal line (US-122), merging private and public into one Crew screen
(US-124), the Progress and Me contents (US-124), sheets from routes, any change to match screens, and any backend
change.
