# US-116 — Sheets and routes: design

Status: proposed. Story: `docs/product-backlog.md`, Phase 8. Context: section 7 and 9 of
`2026-11-06-ui-refactor-wireframes-design.md`.

## 1. Goal

One sheet component and one router, so that every later Phase 8 story (tabs, setup, auction and help
sheets, one table) opens screens and choices the same way. Players see no change.

## 2. Today

- `app.js` (3,354 lines) holds the route table (`pathToView`, `viewForPath`) and `renderView()`.
- About 20 call sites call `window.history.pushState` and then `renderView()`; the link-click handler does the
  same and asks `askToLeave()` first for links marked `data-confirm-leave` (US-110). `popstate` calls `renderView`.
- The leave dialog is a native `<dialog>` opened with `showModal()`. The pass-and-play handoff is a
  `div role="dialog"` that covers the table. The delete confirmation, the sign-up warning, the match end and the
  round review are separate overlays.
- Frontend modules are plain scripts with a `module.exports` guard, loaded by `<script>` in `index.html` and
  tested by `.cjs` files in `crates/beelot-server/frontend-tests/`.

## 3. Decisions

1. **The sheet is a native `<dialog>` opened with `showModal()`.** The browser provides the focus trap, the inert
   background, the top layer and `Escape`. A custom `div` would need all of that hand-written and tested on Safari.
2. **Plain scripts, no bundler.** `router.js` and `sheet.js` follow the existing pattern (global functions plus a
   `module.exports` guard) and are added to `index.html`; the CSP is unchanged.
3. **No visible change.** The existing routes, texts and look stay. Tabs and routed sheets arrive with US-117 to
   US-123; this story only prepares the mechanism and migrates two overlays.

## 4. `router.js`

Pure functions, tested in Node.

- `routeFor(pathname)` returns `{ view, tab, sheet, params }`.
  - `view` is what `viewForPath` returns today, with the same fallback to `home` for an unknown path.
  - `params` holds the id of `/play/bot/game/:id`, `/play/bot/bidding/:id` and
    `/online/{private,public}/table/:id`, replacing the `pathname.split("/").at(-1)` calls.
  - `tab` and `sheet` are `null` for every route in this story. The route table has a field for each, so a later
    story maps `/rules` to "table plus Help sheet" by editing a table entry, not the handlers.
- The route table moves out of `app.js`: `pathToView` and `viewForPath` become the `routeFor` implementation, and
  `app.js` keeps a thin `viewForPath` wrapper only while call sites are migrated.
- `navigate(path, { replace })` replaces the direct `pushState` calls and the link-click handler's own push:
  1. if the path is not a known route, it does nothing (the link behaves as a normal link, as today);
  2. if the current page needs a leave confirmation (`leaveConfirmation`, US-110) it opens the leave sheet and stops;
  3. otherwise it pushes (or replaces) the history entry and calls `renderView()`.
- `popstate` still calls `renderView()`, except when it closes a sheet (section 5).
- Routes do not change: `/`, `/index.html`, `/play/bot`, `/play/local`, `/online/private`, `/online/public`,
  `/stats`, `/settings`, `/privacy`, `/rules`, `/tutorial`, `/play/bot/game/:id`, `/play/bot/bidding/:id`,
  `/online/private/table/:id`, `/online/public/table/:id`. The server's SPA fallback is untouched.

## 5. `sheet.js`

A sheet is a `<dialog class="sheet">` in `index.html` with a grabber, a panel and a backdrop. Existing markup is
reused; the component adds behaviour.

```
openSheet(dialog, { opener, dismissible = true, onClose })
closeSheet(dialog, result)
```

- **Open.** Stores `opener` (default `document.activeElement`), calls `showModal()` and sets `aria-modal="true"`
  explicitly. Focus goes to the element marked `autofocus`, else the first control.
- **Close.** `Escape`, a backdrop click, a drag, or a button calls `closeSheet`. Focus returns to the opener when
  it is still in the document, else to `main`.
- **Drag to close.** Pointer events on the grabber. The sheet follows the finger vertically; on release it closes
  when the drag passes 30% of the sheet height or the release speed passes 0.5 px/ms, otherwise it springs back.
  `dragOutcome({ distance, height, speed })` is a pure function. With Reduced or Off effects (US-094) the
  slide animation is skipped; the drag still works. A keyboard user closes with `Escape` or the close button.
- **History.** Opening pushes `{ sheet: id }` onto the history so the back button closes the sheet. `popstate` with
  an open sheet closes it and does not render a view. Closing by other means calls `history.back()` so the stack
  stays in step. A sheet opened over a table never leaves the page's own URL.
- **`dismissible: false`.** `Escape` (the `cancel` event), the backdrop and the drag do nothing, and the back
  button re-pushes its entry. Only the sheet's own button closes it. Chrome closes a dialog on a second
  consecutive `Escape`; the component reopens such a dialog from its `close` event when it was not closed through
  `closeSheet`.
- **One at a time.** Opening a sheet while another is open closes the first without restoring its focus.
- **Screen readers.** The dialog keeps `aria-labelledby` and, where present, `aria-describedby`.

### Migrations in this story

| Overlay | Becomes | Notes |
|---|---|---|
| Leave dialog (US-110) | `sheet`, dismissible | Same texts, buttons and `danger-button`. "Stay" is `autofocus`. Not pushed to history (see below). |
| Pass-and-play handoff | `sheet`, not dismissible | A `<dialog>` instead of a `div`; covers the hand until "I'm ready". Its resolve logic in `app.js` is unchanged. |

The leave sheet is the one exception to the history rule: it asks before a navigation, so it adds no entry. The
browser's back button from a table behaves as it does today (US-110 asks only for links and the Leave button).

The delete confirmation, sign-up warning, match end and round review keep their current markup. They move to
sheets in later stories.

## 6. CSS

A new `/* Sheets */` section in `styles.css`, using the existing colour and radius variables:
`.sheet` (bottom-anchored on phones, max-width 480px and centred from 1024px), `.sheet::backdrop`, `.sheet-grabber`
and the open/close transition. The leave dialog's current styles are replaced by the sheet's; `.handoff`
keeps its look through a modifier. Text keeps its contrast in every table theme (US-087).

## 7. Files

- New: `static/router.js`, `static/sheet.js`, `frontend-tests/router.test.cjs`, `frontend-tests/sheet.test.cjs`.
- Changed: `static/index.html` (script tags, leave and handoff markup), `static/app.js` (use `routeFor`,
  `navigate`, `openSheet`), `static/styles.css`.
- Not changed: the Rust code, the API, the translations (no new text), the CSP.

## 8. Tests and checks

- **Router tests.** Every route in section 4 resolves to the view it has today; ids reach `params`; an unknown path
  gives `home`; `navigate` ignores unknown paths, asks to leave when `leaveConfirmation` says so, and otherwise
  pushes once and renders once.
- **Sheet tests.** `dragOutcome` boundaries (distance and speed); focus returns to the opener; a non-dismissible
  sheet ignores `cancel`, backdrop and drag; opening pushes one history entry and `popstate` closes without
  rendering a view; opening a second sheet closes the first. They run on a small DOM stub, or on `jsdom` only if
  the existing tests already use it.
- **Existing tests.** All current frontend tests pass at each step, including the leave-confirmation tests.
- **Browser checks** (Chrome and Safari): at 375×667 and 1280px, with Reduced and Off effects: leave a solo table
  and stay, leave and confirm; open and close each by `Escape`, drag and the back button; the pass-and-play
  handoff cannot be dismissed by `Escape`, drag, backdrop or the back button; every route above opens the same
  content from a cold load and from a link.
- **Repository gates.** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test --workspace` (Docker for the MariaDB tests).

## 9. Risks

- **Safari `<dialog>` and `popstate`.** Focus return and the cancel behaviour differ between engines. Mitigation:
  the manual Safari check above; the pure functions carry the logic.
- **Back button and sheets.** History bookkeeping can drift when a sheet closes during a navigation.
  Mitigation: one owner (`sheet.js`) for sheet entries, and tests for open, close and back.
- **Migrating about 20 `pushState` calls.** Done in one pass with the router tests as a safety net; calls that
  replace the entry (`replace`) are kept as they are today.

## 10. Out of scope

Tabs (US-117), new sheets (US-118 to US-123), routing sheets from URLs, moving the other overlays, splitting
`app.js` beyond the two new modules, and any change to routes or texts.
