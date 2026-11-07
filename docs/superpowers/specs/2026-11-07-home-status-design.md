# US-122 — A home that shows where you are: design

Status: implemented, decisions taken by the implementer. Story: `docs/product-backlog.md`, Phase 8.

## 1. Goal

Home answers "what do I do next?": Play now stays the one primary button, a "Resume your match" card shows a solo
match in progress, the goal line leads to Progress, four mode cards sit in a 2×2 grid, and the sign-in panel is no
longer on the home page.

## 2. Today

Home holds the hero, Play now, a goal line (US-113, a paragraph), Customise, the intro, three badges, the account bar
with the sign-in panel, the tutorial banner (US-104) and six mode cards (Quick game, Learn the basics, Bring the crew,
Find a game, Pass and play, Table talk). A solo table's player token lives in `sessionStorage` (`beelot.table-tokens`):
a reload restores a match in the same tab, a new tab or a restart does not.

## 3. Decisions

1. **The resume record is one entry in `localStorage`** (`beelot.resume`: `{tableId, playerToken}`), written when a solo
   table (kind LOCAL, not pass and play) is drawn, removed when its match is complete or the server no longer knows it.
   Solo tokens guard nothing but a game on this device, so keeping one is no new exposure. Online tables and pass and
   play are never remembered.
2. **A reload restores the match.** `tableSession(id)` falls back to the resume record when the tab has no token for
   that table, so `/play/bot/game/:id` and `/play/bot/bidding/:id` open in a new tab or after a restart.
3. **The card is a pure model.** `resumeCard(snapshot)` (in `home-status.js`) returns `null` for a missing, complete,
   online or pass-and-play table, else `{ path, variantLabel, yours, theirs, target }` with the path of the auction or
   of the cards. Home fetches the snapshot when it opens and hides the card on any failure (and forgets the record on a
   refusal).
4. **The card sits under Play now**, secondary in weight (a paper card, no primary button), above the goal line.
5. **The goal line is a link to `/stats`** (the Progress tab): the same text, an anchor instead of a paragraph.
6. **Four cards in a 2×2 grid**: Bring the crew, Find a game, Pass and play, Learn the basics. Quick game duplicates Play
   now and Table talk (`/rules`) moves to the help sheet (US-123); `/rules` and the tab stay reachable by address until
   then.
7. **The account bar and sign-in panel move to Settings** (the Me tab), ids unchanged so the passkey code is untouched.
   Statistics keeps its own sign-in button.

## 4. Texts

New: "Resume your match", "{0} · your team {1}, theirs {2}" (French and Dutch, flagged for native review).

## 5. Tests and checks

- `home-status` tests: record read/write/forget with a failing storage; `resumeCard` for auction, play, complete,
  online, pass and play, missing; scores from the viewer's team.
- Wiring tests: home no longer has `account-bar`, `quick-game` or the Table talk card; Settings has the account bar; the
  goal line is an anchor to `/stats`; four mode cards in order; `tableSession` falls back to the record; the resume card
  is filled when home renders.
- Browser checks on the mocked API: home at 375×667 shows Play now fully; with a resume record the card shows and links
  to the cards.

## 6. Risks

A stale record (the server restarted): the card is hidden and the record dropped on the first refusal. Two solo tabs:
the last one drawn wins the record.

## 7. Out of scope

Resuming online tables, a list of several matches, deleting the old views, the help sheet.
