# US-125 — A desktop layout and a cleaner stylesheet: design

Status: implemented in part (see section 4). Story: `docs/product-backlog.md`, Phase 8.

## 1. Decisions

1. **Desktop (from 1024px).** The tab bar was already a top navigation and sheets already centred modals of at most
   480px (US-116, US-117). The lobby and auction sheets, which are not dialogs, now centre the same way. The reaction
   tray becomes a permanent side panel on the felt (opened by the script because `[hidden]` is `!important`; the toggle is
   hidden), from the same DOM as the phone's tray. The chip row keeps its place under the top seat.
2. **`app.js` is seven plain scripts** of about 570 lines each (`app-core`, `app-session`, `app-table-ui`,
   `app-solo-table`, `app-celebrations`, `app-auction`, and `app.js` loaded last as the entry point), cut at statement
   boundaries, sharing one global scope and loading in the order of `index.html`. The cut is by size and position, not
   yet by clean responsibility. Functions of later scripts are not hoisted into earlier ones, so the one top-level object
   that referenced two of them now wraps them in arrows. `frontend-tests/app-source.cjs` joins the scripts for the wiring
   tests; `/app.js` stays a served file.
3. **Dead CSS is removed by a conservative script**: a rule goes only if every selector of it names a class or id that
   appears nowhere in the HTML or scripts, counting dynamically built names (`reaction-${placement}`). Eight rules went.
4. **Tokens**: spacing and radius custom properties join the colour tokens; new rules use them.

## 2. Tests and checks

Wiring tests read the joined scripts; an error sweep opens every route in headless Chrome on the mocked API and reports no
exception (the `/stats` TypeError is the mock answering `{}`); screenshots of the online table and lobby at 1280×800.

## 3. Risks

A top-level statement in one script that uses a function of a later script fails at load; the sweep covers the routes
but not every code path, so the first run on a real server matters.

## 4. Not done

The trick log in the side panel (no trick log exists yet), the help button in the panel (Help stays in the menu),
splitting `styles.css` into component files, removing unused IDs, and checking every table theme and effects level on
desktop (US-087, US-094 rules are untouched, not re-verified).
