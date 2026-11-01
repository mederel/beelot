# Bot Characters, Reactions and Lines (US-088) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot seats get an illustrated character, react to the game with expressions, and make occasional in-character comments that the player can switch off.

**Architecture:** An `avatars.svg` sprite (four faceless characters + five shared faces) is drawn by `renderTableSeats` for seats whose name is a known bot. Three pure, Node-tested modules (`bot-characters.js`, `bot-reactions.js`, `bot-lines.js`) hold the logic; `app.js` only wires them to the DOM. Built in three parts (characters, reactions, lines), each shippable alone.

**Tech Stack:** Vanilla JS, inline SVG sprite and CSS in `crates/beelot-server/static/`, Node `node:test`, Playwright MCP for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-01-bot-characters-design.md` (effects patterns: `docs/superpowers/specs/2026-10-31-effects-level-design.md`).

## Global Constraints

- Frontend only: no server change, no dependency.
- Characters are keyed by the seat names `Camille`, `Luc`, `Manon`, `Hugo` (case-sensitive); any other name is a human and keeps the initial on a coloured disc.
- Expressions: `neutral`, `thinking`, `pleased`, `annoyed`, `celebrating`. Transient ones last 2.5 s; thinking shows while a bot is the active player and no trick is being reviewed.
- Opening or reloading a game mid-match produces no reaction (no `previous` board, no events).
- Lines: 4 characters × 8 kinds (`coincheMade`, `coincheReceived`, `contractMade`, `contractFailed`, `capot`, `bigTrick`, `matchWon`, `matchLost`) × 2 lines; at most about 40 characters; no cards, suits, digits, bid values or "AI"; "bot" if the bot is mentioned; fixed English keys passed through `t()`.
- At most one comment per round; priority coinche > capot > contract failed/made > big trick; match end always speaks; bubble shown 3 s, one at a time, `aria-hidden="true"`, clear of the cards at 390 × 844.
- Settings option "Bot comments", on by default, `localStorage` key `beelot.bot-comments` ("false" turns it off); expressions stay when off.
- Effects (US-094): Full bounce 200 ms (transform only); Reduced fade `var(--effect-fast)`; Off instant. The expression itself always shows.
- New texts in French (`i18n.js`) and Dutch (`i18n-nl.js`), tone kept, "bot" never "AI".
- Project checks: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (Docker running), `node --test crates/beelot-server/frontend-tests/`.

## Review Focus

- A seat that switches from human to bot name (a player leaves, a bot takes the seat): avatar changes cleanly, no stale expression timer. Test: Task 2 / Task 4 browser.
- Duplicate snapshots (SSE refresh with the same board) and bidding+board both reporting a coinche: events are not emitted twice. Test: Task 3 (`botEvents` with identical consecutive boards; coinche deduplicated).
- Pass-and-play viewer rotation changes `currentPlayerIndex` but not seat indexes: events/expressions use absolute seat indexes. Test: Task 3 cases with different viewers.
- Events with no bot on the relevant team (human-only team scores, all humans): no line, no crash. Test: Task 5 `pickLine` returns null.
- Table or game switch mid-timer (navigate home, new game): timers cleared, no write to a removed seat. Test: Task 4 browser.

---

## Part 1 — Characters

### Task 1: Sprite and `botCharacter`

**Files:**
- Create: `crates/beelot-server/static/avatars.svg`, `crates/beelot-server/static/bot-characters.js`
- Test: `crates/beelot-server/frontend-tests/bot-characters.test.cjs`, `crates/beelot-server/frontend-tests/avatars-sprite.test.cjs`

**Interfaces:**
- Produces: `botCharacter(name: string) -> { key: "camille"|"luc"|"manon"|"hugo", name: string } | null` (exported via the usual `if (typeof module !== "undefined") module.exports = { botCharacter }` guard); sprite symbol ids `avatar-camille`, `avatar-luc`, `avatar-manon`, `avatar-hugo` and `face-neutral`, `face-thinking`, `face-pleased`, `face-annoyed`, `face-celebrating`, all in the same 64 × 64 viewBox.

- [ ] **Step 1: Write failing tests.** `bot-characters.test.cjs`: the four names return `{key, name}` with keys `camille|luc|manon|hugo`; `"You"`, `"Ana"`, `""`, `"camille"` (wrong case), `null` and `undefined` return `null`. `avatars-sprite.test.cjs` (style of `suits-sprite.test.cjs`): `avatars.svg` parses and contains each of the nine symbol ids with a `viewBox="0 0 64 64"`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bot-characters.test.cjs crates/beelot-server/frontend-tests/avatars-sprite.test.cjs`. Expected: FAIL (module / file not found).
- [ ] **Step 3: Implement** `botCharacter` and draw `avatars.svg`: four faceless character symbols (head shape, hair, accessory; thick outline and saturated colours, distinct main colour each: Camille warm with round glasses, Luc messy hair and a cap, Manon ponytail, Hugo beard) and the five face symbols (eyes, brows, mouth only) designed to sit centred on any character. The characters must be readable at 1.6 rem.
- [ ] **Step 4: Run** the same command. Expected: PASS. Also render the sprite in the browser (static file) and look at all 4 × 5 combinations at 26 px and 64 px; fix anything unreadable.
- [ ] **Step 5: Commit** `feat: add the bot characters sprite (US-088)`.

### Task 2: Draw the characters at the seats

**Files:**
- Modify: `crates/beelot-server/static/app.js` (`renderTableSeats` ~line 1470-1500), `crates/beelot-server/static/index.html` (script tag next to `contract-badge.js`), `crates/beelot-server/static/styles.css` (`.player-avatar` rules ~633-649, 1327, 1480)

**Interfaces:**
- Consumes: `botCharacter(name)` (Task 1); sprite ids above.
- Produces: seats of known bots contain `<svg class="player-avatar bot-avatar" data-character="<key>" data-expression="neutral" aria-hidden="true">` with two `<use>`: `/avatars.svg#avatar-<key>` and `/avatars.svg#face-neutral`. Task 4 changes the second `<use>`'s `href` and `data-expression`.

- [ ] **Step 1:** Add `<script src="/bot-characters.js"></script>` in `index.html` before `app.js`.
- [ ] **Step 2:** In `renderTableSeats`, when `botCharacter(seat.name)` is non-null, build the SVG avatar (via `createElementNS`, as the dealer chip does) instead of the initial; humans unchanged. Put the creation in a small helper `botAvatar(character)` so Task 4 can reuse it.
- [ ] **Step 3:** CSS: `.bot-avatar` same footprint as `.player-avatar` at every breakpoint (desktop and the two phone sizes), no coloured disc background.
- [ ] **Step 4: Check** `node --check crates/beelot-server/static/app.js` and the Node tests. Browser (dev server is run by the user on 8080; do not start or stop it): a bot game, bidding, pass-and-play and a private table with bots show the right character at each bot seat and the initial for humans; seat layout unchanged on 390 × 844.
- [ ] **Step 5: Commit** `feat: show the bot characters at the seats (US-088)`.

---

## Part 2 — Reactions

### Task 3: `bot-reactions.js` (pure)

**Files:**
- Create: `crates/beelot-server/static/bot-reactions.js`
- Test: `crates/beelot-server/frontend-tests/bot-reactions.test.cjs`

**Interfaces:**
- Consumes: board shape from the snapshot: `board.seats[i] = { name, team, ... }`, `board.completedTricks`, `board.reviewingCompletedTrick`, `board.trickWinner` (a seat name), `board.trickPoints`, `board.coinched`, `board.declaringPlayerIndex`, `board.roundResult` (`contractMade`, `capotTeam`), `board.activePlayerIndex`; `match.complete`, `match.winner` (a team name).
- Produces:
  - `botEvents(previous, board, match) -> Event[]` where `Event = { type: "trick"|"coinche"|"round"|"match", seat?: number, team?: string, big?: boolean, contractMade?: boolean, capot?: boolean }`. `previous` is the last board (or `null`: returns `[]`). Same board twice returns `[]`. A coinche is reported once per round.
  - `expressionsFor(events, board) -> { [seatIndex: number]: "pleased"|"annoyed"|"celebrating" }` for bot seats only (names for which a character exists are decided by the caller via a `isBot(name)` argument: signature `expressionsFor(events, board, isBot)`); humans never appear.
  - `isThinking(board, seatIndex) -> boolean`: that seat is `board.activePlayerIndex` and `!board.reviewingCompletedTrick` and no `roundResult`.
  - Exported through the module.exports guard.

- [ ] **Step 1: Write failing tests** with small hand-built boards (4 seats North-South/East-West): `null previous gives no events`; `identical boards give no events`; `a new reviewed trick gives one trick event with the winner's seat; big at 20 points, not at 19`; `coinche flips once and is deduplicated within a round`; `round result gives contractMade/capot with the declaring team`; `match complete gives a match event with the winner team`; expressions: trick winner pleased (celebrating when big), partner pleased, opponents annoyed only on a big trick; coinche: declaring team annoyed, coincher pleased; round made/failed/capot per the spec table; match winners celebrating, losers annoyed; humans (isBot false) excluded; works for a pass-and-play viewer change (same absolute seat indexes, different `currentPlayerIndex`); `isThinking` only for the active seat and not during review or after the round result.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bot-reactions.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement** per the Interfaces block and the spec's "Events"/expression table.
- [ ] **Step 4: Run** the file, then the whole folder. Expected: PASS.
- [ ] **Step 5: Commit** `feat: derive bot reactions from the game (US-088)`.

### Task 4: Wire the expressions

**Files:**
- Modify: `crates/beelot-server/static/app.js` (`renderTableSeats` callers: `loadBotGame`, `loadBidding`, `renderPrivateBoard`; game-key reset in `renderView`), `crates/beelot-server/static/index.html` (script tag), `crates/beelot-server/static/styles.css` (expression transitions under `body[data-effects]`)

**Interfaces:**
- Consumes: `botEvents`, `expressionsFor`, `isThinking` (Task 3); `botAvatar` helper (Task 2); `effectsLevel()`.
- Produces: `setBotExpression(prefix: string, seatIndex: number, expression: string)` updating `data-expression` and the face `<use href>` of that seat's avatar; per-table state (previous board, expression timers) reset together with `scoreBarGame` in `renderView` and cancelled on game change.

- [ ] **Step 1:** `<script src="/bot-reactions.js"></script>` before `app.js`.
- [ ] **Step 2:** After each board render in the three paths, compute events against the table's previous board, apply transient expressions (2.5 s timers, newer event replaces older, return to neutral or thinking), and thinking for the active bot. Keep one timer per seat; clear all on game change, view change and re-render of a changed seat.
- [ ] **Step 3:** CSS: Full bounce 200 ms on `.bot-avatar` when `data-expression` changes (animation class applied by JS, transform only); Reduced fade `var(--effect-fast)`; Off none. Follow the patterns around the effects rules (~1215-1283).
- [ ] **Step 4: Check** `node --check`, Node tests. Browser: thinking while a bot is to act; pleased/annoyed after a big trick, coinche, round end and match end; reload mid-game shows no reaction; leave to home mid-timer and return (no stale writes, no console errors); a human takes a bot's seat or vice versa if reachable; effects Reduced and Off; pass-and-play; private table.
- [ ] **Step 5: Commit** `feat: make the bot avatars react to the game (US-088)`.

---

## Part 3 — Lines

### Task 5: `bot-lines.js` (pure) and its translations

**Files:**
- Create: `crates/beelot-server/static/bot-lines.js`
- Modify: `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`
- Test: `crates/beelot-server/frontend-tests/bot-lines.test.cjs`

**Interfaces:**
- Consumes: `Event` shape from Task 3.
- Produces:
  - `BOT_LINES: { [characterKey]: { [kind]: [string, string] } }` for the 4 characters and 8 kinds.
  - `lineFor(characterKey: string, kind: string, seed: number) -> string` (English key; stable for the same seed).
  - `pickLine(events: Event[], board, isBot: (name) => boolean, characterOf: (name) => {key}|null, seed: number) -> { seat: number, text: string } | null`: at most one line per call; priority coinche > capot > contract failed/made > big trick, match end always speaks; the speaker is a bot on the team the event is about (the focal seat if it is a bot, else that team's other bot); `null` when no bot qualifies. Exported through the module.exports guard.

- [ ] **Step 1: Write failing tests:** every character has at least two lines for every kind; every line is at most 40 characters and contains no digit, no card rank or suit word (Ace, King, Queen, Jack, Ten, Heart, Diamond, Club, Spade, trump), and not "AI" as a word; all 64 lines are distinct; every line, "Bot comments" and "Bots comment on the game." exist as keys in `i18n.js` and in `i18n-nl.js` (read both files as text and search for the quoted key); `lineFor` is stable for the same seed and may differ for others; `pickLine`: returns null for no events, for a human-only team, and for no bots; picks the highest priority when several events occur; never picks a human speaker; match end speaks; at most one result.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bot-lines.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Write the 64 English lines** in `BOT_LINES` in each character's voice (Camille warm and encouraging, Luc teasing and joking, Manon confident and competitive, Hugo dry and understated), and implement `lineFor` and `pickLine`.
- [ ] **Step 4: Write the French and Dutch** for all 64 lines plus the two Settings texts in `i18n.js` and `i18n-nl.js`, keeping each character's tone (no word-for-word translation) and the same ≤ 40-character limit; follow the file's existing format.
- [ ] **Step 5: Run** the file, then the whole folder. Expected: PASS.
- [ ] **Step 6: Commit** `feat: write the bot lines in three languages (US-088)`.

### Task 6: Show the comments and the Settings toggle

**Files:**
- Modify: `crates/beelot-server/static/app.js` (settings handlers near `reactions-enabled` ~2100-2174; the render paths from Task 4), `crates/beelot-server/static/index.html` (Settings checkbox near line 522, script tag), `crates/beelot-server/static/styles.css`

**Interfaces:**
- Consumes: `pickLine`, `lineFor` (Task 5); events from Task 4's per-table state; `botCharacter`.
- Produces: `botCommentsEnabled() -> boolean` (`localStorage "beelot.bot-comments"`, anything but `"false"` is on, wrapped in try/catch like `reactionsEnabled`); `showBotLine(prefix, seatIndex, text)`.

- [ ] **Step 1:** Add the Settings checkbox `#bot-comments` (checked by default) with the label "Bot comments" and the description "Bots comment on the game.", plus load/save handlers modelled exactly on `#reactions-enabled`; script tag for `bot-lines.js`.
- [ ] **Step 2:** After the events of a render are known (Task 4), if comments are enabled and no line was shown yet this round, call `pickLine` and show the bubble next to that seat's avatar for 3 s, one at a time, `aria-hidden="true"`, text through `t()`. Track "line shown this round" per table and reset it when the round changes. When disabled, show nothing (expressions unaffected).
- [ ] **Step 3:** CSS for the bubble in the table's cartoon style, positioned beside the avatar for all four seat placements, never over the cards, inside the viewport at 390 × 844; pop at Full, fade at Reduced, instant at Off.
- [ ] **Step 4: Check** `node --check`, Node tests. Browser: a comment appears after a coinche / capot / contract result / match end; never two in a round; Settings toggle hides comments but not expressions and persists after reload; reload mid-game shows no comment; bubble clear of cards on both sizes; effects Reduced and Off.
- [ ] **Step 5: Commit** `feat: let the bots comment on the game (US-088)`.

---

### Task 7: Verification and wrap-up

**Files:**
- Modify (if findings need recording): `docs/superpowers/specs/2026-11-01-bot-characters-design.md` ("Known limits")

- [ ] **Step 1: Full browser matrix** per the spec's Testing section (French, then English and Dutch once; 1280 × 800 and 390 × 844; bot game, bidding, pass-and-play, private table with bots; every effects level; Settings toggle; reload; leave mid-timer). Look at screenshots of the avatars and bubbles at both sizes and judge them honestly. Fix any defect with a focused commit.
- [ ] **Step 2: Run the project checks:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (if Testcontainers cannot run in the sandbox, say exactly so), `node --test crates/beelot-server/frontend-tests/`. Expected: all pass.
- [ ] **Step 3: Record findings** in the spec's "Known limits"; commit `docs: record what the bot characters verification found (US-088)`. Do not push.
