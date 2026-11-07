# US-123 — Help at the table: design

Status: implemented, decisions taken by the implementer. Story: `docs/product-backlog.md`, Phase 8.

## 1. Goal

The rules, the card order and a hint are one tap from the table, in a sheet, so nobody leaves the game to check a rule.

## 2. Today

The table menu links to `/rules`, a full page that takes the player out of the match (the tab bar is hidden at the table,
the page is a separate view). The hint is a menu button (US-065). The setup sheet has an inline "What is this?" note.

## 3. Decisions

1. **One help sheet** (`#help-sheet`, a modal `<dialog data-sheet>`, so Escape, focus trap and return of focus come
   from US-116). It holds, in this order: the hint button (only where the table offers hints), the card order, the rules
   reference, and a link to the tutorial.
2. **No duplicated rules text.** The rules reference stays as the hidden `data-view="rules"` markup (translated with the
   rest of the page); the sheet clones its sections when it opens, and moves "Card order" (`#rules-card-order`) to the top.
3. **Entry points.** The table menu's "Rules reference" link becomes a "Help" button; the setup sheet's "What is this?"
   note gets an "Open the rules and card order" button; `/rules` opens home with the help sheet (route sheet `help`,
   closing it returns to `/`). The sheet opened from the table is routed (the back button closes it); from `/rules` it is
   not (the address is the route).
4. **The hint button in the sheet** closes the sheet and presses the menu's hint button, so hints keep one code path.
5. **From the setup sheet**, help replaces the setup sheet (one sheet at a time, US-116) and reopens it when closed; the
   form keeps what was typed because the DOM is not reset.
6. **Accessibility.** Labelled dialog, a named close button, headings in order (h2 title, h3 sections), the hint button
   is a real button, Escape closes.

## 4. Texts

New, French and Dutch: "Help", "Open the rules and card order", "Ask for a hint", "Rules reference" (exists).

## 5. Tests and checks

Router: `/rules` is home with sheet `help`. Wiring: the sheet exists with its parts; the menu has Help and no link to
`/rules`; the setup note has the button; `openHelpSheet` clones from the rules view; texts translated. Browser checks
(mocked API): the sheet at 360×640 and 1280×800, scrolls inside itself, opens from the table menu.

## 6. Out of scope

A tutorial played on the table (`/tutorial` stays its own page for now), the hint in the sheet at online tables (no hints
there), deleting the rules view's route-level page.
