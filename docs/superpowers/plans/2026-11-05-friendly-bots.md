# Friendly bots (US-112) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One bot greets the player when a game starts, no bot line mocks the player, and a big trick no longer swallows the round-result line.

**Architecture:** Frontend only, all under `crates/beelot-server/static/`. The catalogue and the "which line speaks" decisions stay pure in `bot-lines.js` (Node-tested); `bot-expression-state.js` reports a new `greeting` event; `app.js` only shows the bubble.

**Tech Stack:** Vanilla JS modules with CommonJS exports for `node --test`; Playwright for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-05-friendly-bots-design.md`

## Global Constraints

- Every line: at most 40 characters, no digits, no card/suit words, never "AI" (existing test).
- No line contains: cry, lucky, gift, adorable, rigged, fluke, "pay up", "get used", "enjoy it", "bad idea".
- English line text is the `t()` key: every new or rewritten line needs FR (`i18n.js`) and NL (`i18n-nl.js`) entries in the same `"key": "value",` format; delete the entries of replaced lines. FR/NL values are at most 40 characters and keep the character's tone (not word for word).
- Settings option `beelot.bot-comments` ("false" = off) and `aria-hidden` bubbles are unchanged; no server change, no new dependency.
- AGENTS.md checks before the PR: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (Docker running), `node --test crates/beelot-server/frontend-tests/`.

## Refinement of the spec's "game start"

The spec says "first deal, scores 0–0, no trick played, no call made". Bots bid on the server in one step, so the first bidding snapshot may already hold calls. The plan therefore uses: **the first snapshot of a game id** (state reset by `reset(gameId)`) that satisfies `bidding.round === 1` (bidding snapshot) or `completedTricks === 0 && roundResult == null` (board snapshot), **and** `match` scores both 0 when a `match` is supplied. The greeting is reported once per game id (`greeted` flag, cleared by `reset`). Tell the user in the PR description.

## Review Focus

- A reload mid-game in a fresh tab must not greet (round > 1, or tricks played, or non-zero scores).
- Comments off: no greeting and no later bubble, but `beelot.greeted` is still recorded so turning comments on mid-game does not greet late.
- Table with no bot (all humans online): no greeting, no error.
- The viewer's left seat is a human (online table): the next bot clockwise greets.
- `sessionStorage` unavailable (private window): greeting still works once per page load, no exception.

## File Structure

- Modify `static/bot-lines.js`: tone rewrites, `greeting` lines, `greetingFor`, `commentFor`, `kind` on `pickLine` results.
- Modify `static/bot-expression-state.js`: `greeting` event.
- Modify `static/app.js`: use `greetingFor` / `commentFor` in `commentOnEvents`; pass `match` to `updateBidding`.
- Modify `static/i18n.js`, `static/i18n-nl.js`: texts.
- Tests: `frontend-tests/bot-lines.test.cjs`, `frontend-tests/bot-expression-state.test.cjs`.

---

### Task 1: Rewrite the lines that mock the player

**Files:**
- Modify: `crates/beelot-server/static/bot-lines.js`, `static/i18n.js`, `static/i18n-nl.js`
- Test: `crates/beelot-server/frontend-tests/bot-lines.test.cjs`

**Interfaces:**
- Produces: the same `BOT_LINES` shape (8 kinds × 2 lines × 4 characters, still 64 distinct lines).

- [ ] **Step 1: Write the failing test** `no line mocks the player` in `bot-lines.test.cjs`: for every line of `allLines()` and every French and Dutch value of those lines (reuse the regex lookup of the existing "keep the 40-character limit" test), assert the English line does not match `/\b(cry|lucky|gift|adorable|rigged|fluke)\b|pay up|get used|enjoy it|bad idea/i`. Also assert the 19 old lines from the spec table are absent from `allLines()` and the 19 new lines are present (`assert.ok(allLines().includes(...))`).
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bot-lines.test.cjs`. Expected: FAIL on the new test only.
- [ ] **Step 3: Replace the 19 lines** in `BOT_LINES` exactly as the spec's table (same slot in the two-line array), then in both i18n files delete the 19 old keys and add the 19 new keys with FR/NL translations that keep tone (Luc cheeky, Manon confident, Hugo dry; none aimed at the player).
- [ ] **Step 4: Run** the whole `node --test crates/beelot-server/frontend-tests/`. Expected: all PASS (the distinct-64, translation and length tests cover the new keys).
- [ ] **Step 5: Commit** `fix: bot lines never mock the player (US-112)`.

### Task 2: Greeting lines, `greetingFor` and `commentFor`

**Files:**
- Modify: `crates/beelot-server/static/bot-lines.js`, `static/i18n.js`, `static/i18n-nl.js`
- Test: `crates/beelot-server/frontend-tests/bot-lines.test.cjs`

**Interfaces:**
- Produces:
  - `BOT_LINES[key].greeting: [string, string]` (spec's 8 lines). `KINDS` in the test stays the 8 existing kinds; add `GREETING = ["greeting"]` helper in the test so tone, length and translation tests also cover them.
  - `greetingFor(event: { type: "greeting", viewer: number }, board: { seats }, isBot, characterOf, seed: number) -> { seat: number, text: string } | null`: the bot at seat `(viewer + 1) % n`, else the next bot clockwise from there (never the viewer), `null` if no bot; `text = lineFor(key, "greeting", seed)`.
  - `pickLine(...)` results gain `kind: string` (e.g. `"bigTrick"`).
  - `commentFor(state: { shown: boolean, trickShown: boolean }, events, board, isBot, characterOf, seed) -> { seat, text, kind } | null`; mutates `state`.
  - Export all three alongside the existing exports.

- [ ] **Step 1: Write the failing tests** in `bot-lines.test.cjs`:
  - greeting lines: every character has two, ≤ 40 chars, no digits, in FR and NL.
  - `greetingFor`: viewer 0 with all bots → seat 1; viewer 0 with seat 1 human (`seatsOf("Ana","Bo","Manon","Hugo")`) → seat 2; viewer 3 → seat 0; all humans → `null`; the text is one of that character's greeting lines and stable for a seed.
  - `commentFor`: (a) a big trick returns `kind: "bigTrick"` and leaves `shown` false, `trickShown` true; (b) a second big trick in the same round returns `null`; (c) a round event after a big trick returns the contract line and sets `shown` true, `trickShown` false (round over); (d) a match event speaks even when `shown` is true; (e) with `shown` true a big trick returns `null`; (f) `pickLine` of a trick event still returns the same `seat`/`text` as before plus `kind`.
- [ ] **Step 2: Run** the file. Expected: FAIL (functions missing).
- [ ] **Step 3: Implement** the greeting lines in `BOT_LINES`, `greetingFor` and `commentFor`. `commentFor` rule: drop `trick` events when `state.shown || state.trickShown`; call `pickLine` if `!state.shown` or a `match` event is present; a `bigTrick` result sets `trickShown`, any other result sets `shown`; when the events contain a `round` or `match` event reset both flags to false after deciding. Add the 8 greeting texts to both i18n files.
- [ ] **Step 4: Run** the whole node test folder. Expected: PASS.
- [ ] **Step 5: Commit** `feat: bot greeting lines and one-comment logic (US-112)`.

### Task 3: Report a `greeting` event

**Files:**
- Modify: `crates/beelot-server/static/bot-expression-state.js`
- Test: `crates/beelot-server/frontend-tests/bot-expression-state.test.cjs`

**Interfaces:**
- Consumes: existing `createBotExpressionState`.
- Produces: `updateBidding(prefix, seats, bidding, match?)` (new optional 4th argument) and `updateBoard(prefix, board, match)` report `{ type: "greeting", viewer: number }` through `onEvents` and the returned events array, `viewer` being `bidding.currentPlayerIndex` / `board.currentPlayerIndex`. The event never changes an expression (`expressionsFor` ignores unknown types; assert it).

- [ ] **Step 1: Write the failing tests** in `bot-expression-state.test.cjs` (use `harness()`; a `bidding(overrides)` helper with `round: 1, auction: [], calls: [], dealerIndex: 3, currentPlayerIndex: 0, activePlayer: "Ana", complete: false`):
  - first bidding snapshot, round 1, `match {northSouth:0,eastWest:0}` → events `[{ type: "greeting", viewer: 0 }]`, reported once, no expression written other than neutral/thinking.
  - same snapshot again, and a following board snapshot → no second greeting.
  - first snapshot with `round: 2`, or with `match.northSouth = 30`, or a board with `completedTricks: 2` → no greeting.
  - first board snapshot with `completedTricks: 0`, `roundResult: null`, scores 0–0 → greeting with `viewer = board.currentPlayerIndex`.
  - after `reset("other-game")` the next qualifying snapshot greets again.
  - bidding snapshot without `match` (standalone bidding view) and `round: 1` greets.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bot-expression-state.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement** a `greeted` flag (false initially and in `reset`) and a helper `atStart(round1Ok, match)`; in `updateBidding` and `updateBoard` add the greeting event first in the events list when `!greeted && atStart(...)`, set `greeted = true` for any first snapshot (qualifying or not, so a later snapshot of a game already under way never greets), then continue as today. `updateBidding` currently returns `[]` early when `bidding` is null: keep that.
- [ ] **Step 4: Run** the whole node test folder. Expected: PASS.
- [ ] **Step 5: Commit** `feat: report a greeting event at the start of a game (US-112)`.

### Task 4: Show the greeting and the new comment logic

**Files:**
- Modify: `crates/beelot-server/static/app.js` (`botCommentState` ~l.1845, `commentOnEvents` ~l.1884, the `updateBidding` calls at ~l.753, 840, 1231, 2289)

**Interfaces:**
- Consumes: `greetingFor`, `commentFor`, `updateBidding(..., match?)`.

- [ ] **Step 1: Write the failing check**: a static test in `bot-lines.test.cjs` (or a new `friendly-bots.test.cjs`) asserting `app.js` source contains `commentFor(` and `greetingFor(`, no longer calls `pickLine(`, and that the bot-game call is `updateBidding("bot", seats, snapshot.bidding, match)`. Run: FAIL.
- [ ] **Step 2: Implement** in `app.js`:
  - `botCommentState = { shown: false, trickShown: false, count: 0, line: null, timer: null }`; `resetBotComments` clears both flags.
  - `commentOnEvents(prefix, events, seats)`: for a `greeting` event: mark the game greeted in `sessionStorage` key `beelot.greeted` (JSON array of game ids, `scoreBarGame` is the current id, try/catch, skip if already listed), and only if `botCommentsEnabled()` call `greetingFor(event, { seats }, isBotName, botCharacter, botCommentState.count++)` and `showBotLine`. Other events: if comments enabled, `commentFor(botCommentState, events, { seats }, isBotName, botCharacter, botCommentState.count++)` and `showBotLine`; if comments are off still reset the flags on round/match end (call `commentFor` only when enabled, otherwise clear flags when the events contain `round` or `match`).
  - Pass `match` to `updateBidding` where one exists (bot game l.1231: `match`; private l.753/840: `snapshot.match` if in scope, else omit).
- [ ] **Step 3: Run** `node --test crates/beelot-server/frontend-tests/`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`. Expected: PASS.
- [ ] **Step 4: Browser check** with Playwright against `docker compose up -d --wait && cargo run -p beelot-server`, French, 390 × 844 and 1280 × 800: new bot game greets once from the left bot; reload mid-game does not; comments off shows no greeting; effects Reduced and Off show it without movement; bubble clear of the cards, `aria-hidden`; a big trick then a round result shows two bubbles in turn; no console errors; one pass in English and Dutch. If Docker cannot run DB-backed tests locally (known bridge-network problem), say so and rely on CI.
- [ ] **Step 5: Commit** `feat: friendly bots greet and comment kindly (US-112)`, then open the PR (`feat: friendly bots (US-112)`, auto-merge squash per project memory) after refreshing `main`.

---

## Self-review

- Spec coverage: greeting (T2–T4), single greeter left-of-viewer (T2), not the round's comment (T2 `commentFor`), once per game and reload rule (T3 + sessionStorage in T4), tone rewrites + banned-word test (T1), big trick no longer swallows the result (T2), FR/NL (T1–T2), effects/toggle unchanged (T4 browser check).
- Types: `greetingFor`, `commentFor`, `kind`, `viewer` are named identically in tasks 2–4.
