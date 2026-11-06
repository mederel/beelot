# US-118 — One setup sheet: design

Status: proposed (decisions taken by the implementer, see section 3). Story: `docs/product-backlog.md`, Phase 8.
Context: section 5.2 of `2026-11-06-ui-refactor-wireframes-design.md`. Builds on US-116 (sheets, router) and US-117
(tab bar).

## 1. Goal

One setup sheet, opened over the Play tab, replaces the bot setup view, the pass-and-play form and the creation half
of the private table form. A mode selector (Solo, Pass and play, Crew) swaps only the seat block. The stepped wizard
goes, and the sheet fits one screen at 375×667.

## 2. Today

- `data-view="bot"`: a three-step wizard (`setup-steps.js`, `showSetupStep`) with variant, announcements,
  tout-atout and sans-atout (Contrée only), match target and bot difficulty; its choices are remembered in
  `localStorage` under `beelot.bot-game` and used by "Play now" and "Quick game" (US-102).
- `data-view="local"`: a second form with the same questions under `local-*` IDs, plus four seat names.
- `data-view="private"`: "Create a table" (name and variant only; the other rules are set in the lobby) beside
  "Join friends".
- `/play/bot` and `/play/local` are full views; `routeFor` has no sheet routes yet.
- Each question has an inline `<details class="setup-help">What is this?</details>`.

## 3. Decisions

1. **The sheet is a `<dialog class="setup-sheet" data-sheet>`** (US-116), opened over the Play tab, never a view.
2. **The sheet is the route.** `/play/bot` opens it in Solo mode, `/play/local` in Pass and play, and a new
   `/online/private/new` in Crew mode, each over its tab's page: `routeFor` returns `sheet: "setup"` and
   `params.mode` (`solo`, `pass`, `crew`). The sheet is opened `routed: false`: the URL entry is its history entry, so
   the back button leaves it through the router. Closing it by Escape, drag, the close button or the backdrop
   replaces the URL with its tab's page (`/` for Solo and Pass and play, `/online/private` for Crew).
3. **Switching mode keeps the form.** The mode selector swaps only the seat block and the labels; the variant, bot and
   rules choices stay as they are, and the URL is replaced (`history.replaceState`) without a render. Opening the
   sheet from a route loads that mode's remembered choices.
4. **Crew creates what the server accepts today: a variant and a name.** The table rules (target, announcements,
   tout-atout, turn timer) stay in the lobby, so "More rules" and Bots are hidden in Crew mode. The wireframe's
   "Turn timer (Crew)" line waits for a story that moves the lobby rules.
5. **"More rules" is a collapsed `<details>`** holding match target, announcements and, for Contrée only,
   tout-atout and sans-atout.
6. **Choices are remembered per mode** under `beelot.setup.solo`, `beelot.setup.pass` and `beelot.setup.crew`
   (US-102). Solo falls back to the old `beelot.bot-game` key until a new one is saved. "Play now" and "Quick game"
   use Solo's remembered choices. Pass-and-play seat names are never stored.
7. **"What is this?" stays an inline `<details>` for now.** It cannot open the help sheet before US-123 exists. The
   criterion is carried by US-123, which already owns the help sheet and the ⓘ buttons.
8. **Pure logic in `setup-form.js`**, tested in Node; `app.js` only wires the DOM.
9. **Dead code goes:** `setup-steps.js` and its test, the `bot` and `local` views, the create form, the `local-*` and
   wizard IDs, and the CSS tied to them.

## 4. `setup-form.js`

Plain script with a `module.exports` guard.

- `SETUP_MODES = ["solo", "pass", "crew"]`.
- `DEFAULT_SETUP = { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 }`.
- `loadSetup(storage, mode)` returns the remembered choices for the mode (a crew table remembers only its variant);
  an incomplete or invalid entry, blocked storage or an unknown mode gives the defaults. Solo falls back to the legacy
  `beelot.bot-game` key. `saveSetup(storage, mode, setup)` writes it and never throws.
- `setupBlocks(mode, variant)` returns `{ seats, owner, bots, rules, allTrumps }` booleans: `seats` for Pass and play,
  `owner` for Crew, `bots` and `rules` for Solo and Pass and play, `allTrumps` for those two with Contrée.
- `createRequest(mode, values)` returns the body for `api.createTable`: Solo
  `{ kind: "LOCAL", difficulty, variant, announcements, allTrumps, target }`; Pass and play the same with
  `seats: [north, east, south, west]` (each trimmed, empty becomes `null`); Crew
  `{ kind: "PRIVATE", playerName, variant }`.
- `setupPath(mode)` returns `/play/bot`, `/play/local` or `/online/private/new`; `setupHome(mode)` returns `/`, `/` or
  `/online/private`; `submitLabel(mode)` returns "Deal the cards", "Start pass and play" or "Create private table".

## 5. The sheet

```
Set up your table                         ✕
Mode      ( Solo ) ( Pass and play ) ( Crew )
Variant   ( Classic Belote ) ( Contrée )
Players   North [      ] East [      ]      Pass and play only
          South [      ] West [      ]
Your name [ Player          ]               Crew only
Bots      ( Relaxed ) ( Challenging )       Solo and Pass and play
▸ More rules                                Solo and Pass and play, collapsed
    Match target  ( 500 ) ( 1,000 ) ( 1,500 ) ( 2,000 )
    Announcements ( On ) ( Off )
    Tout-atout and sans-atout ( On ) ( Off )   Contrée only
[ Deal the cards → ]
```

- The choice chips are the existing `.choice-group .choice` component; the seat names reuse the current inputs,
  without the `local-*` IDs (`setup-north` …). Hidden blocks use `hidden`.
- `renderView` opens or closes the sheet from `routeFor(...).sheet`: a popstate to a route without the sheet ends it.
- `sheet.js` gains the close reason: `onClose(reason)` receives `"closed"` when the player dismissed the sheet (Escape,
  backdrop, drag, `closeSheet`) and `"ended"` when the app ended it (`closeAll`, a replaced sheet, a popstate), so the
  setup sheet replaces the URL only when the player closed it.
- Submit: Solo and Pass and play call `api.createTable(createRequest(...))` and go to `/play/bot/bidding/:id`; Crew
  enters the private table as the old form did. The choices are saved first. Errors show in `#setup-message`.
- `/online/private` keeps "Join friends" and gains a "Create a private table" link to `/online/private/new` in place of
  the create form. The Play tab's "Customise", the "Leave table" and "Change options" links keep their URLs.

## 6. Texts

New English texts, translated into French and Dutch: "Set up your table", "Mode", "Solo", "Close", "More rules",
"Players", "Bots", "Create a private table". Existing texts are reused for the rest ("Deal the cards", "Start pass and
play", "Create private table", the variant, target and announcement labels). The wizard's "Step {0} of {1}" and "Next"
and the old headings may stay in the dictionaries (unused texts are harmless); the French and Dutch wording is flagged
for native review in the pull request.

## 7. Files

- New: `static/setup-form.js`, `frontend-tests/setup-form.test.cjs`.
- Changed: `static/router.js` (sheet routes, `/online/private/new`), `static/sheet.js` (close reason),
  `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`; the tests that
  slice `index.html` at `data-view="bot"` or read the wizard (`play-now`, `tutorial-banner`, `home-promise`,
  `clean-headings`, `router`, `tab-bar`).
- Deleted: `static/setup-steps.js`, `frontend-tests/setup-steps.test.cjs`.
- Not changed: the Rust code, the API, the CSP.

## 8. Tests and checks

- **`setup-form` tests:** defaults; per-mode load and save; the legacy Solo key; invalid, partial and blocked storage;
  `setupBlocks` for every mode and variant; `createRequest` for each mode (seat trimming, empty to `null`);
  `setupPath`, `setupHome`, `submitLabel`.
- **Router tests:** `/play/bot`, `/play/local` and `/online/private/new` return `view` home, home and private, the tab,
  `sheet: "setup"` and the mode; no other route has a sheet; the tab list and the unknown-path fallback are unchanged.
- **Sheet tests:** `onClose` reason for each way a sheet ends.
- **Wiring tests:** the sheet markup (dialog, mode, variant, seats, owner, bots, More rules, submit, no
  `local-*`), no `data-view="bot"`, no `data-view="local"`, no create form, `setup-steps.js` gone, `setup-form.js`
  loaded before `app.js`, the texts translated.
- **Browser checks** (Chrome): at 375×667 and 1280px the sheet opens from "Customise", the mode cards, the Crew tab's
  link and by cold load of `/play/bot`, `/play/local` and `/online/private/new`; it fits one screen at 375×667 in each
  mode with "More rules" collapsed; switching mode swaps only the seat block; each mode starts a game (solo,
  pass and play, a private table); the choices come back per mode after a reload; Escape, drag, the close button and
  the back button close it and leave the right URL; "Play now" uses Solo's choices. Safari is listed as unverified.
- **Repository gates:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.

## 9. Risks

- **Large deletion.** Removing two views and their CSS can leave a stray reference. Mitigation: wiring tests for every
  removed ID, a search for the removed selectors, and the browser pass in every mode.
- **Sheet and router interplay.** The sheet is both a route and a dialog. Mitigation: the close reason, the
  `replaceState` on mode change, and tests on the pure parts.
- **Crew is a reduced form.** Only the variant and name are set at creation; the lobby holds the rest, as today.

## 10. Out of scope

The help sheet and ⓘ buttons (US-123), the Crew tab's merged screen and the lobby rules (US-124, US-121), the table
module (US-119, US-121), the auction sheet (US-120), a turn-timer field at creation, and any backend change.
