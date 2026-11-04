# A readable table header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared sticky header (menu, compact score, one status line) for solo and pass-and-play bidding and play.

**Architecture:** `#table-header` wraps `#score-bar` and a new `#table-bar` (menu button + `#table-status`, menu with Hint, Rules, Leave). `static/table-status.js` is a pure model; `app.js` feeds it from `loadBotGame`/`loadBidding` and writes through `setTableStatus`.

**Tech Stack:** Plain browser JavaScript and CSS, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-table-header-design.md`

## Global Constraints

- No server change; every new text through `t()` with FR and NL entries (texts listed in the spec).
- The private table's chips and message line stay; `.game-status` CSS stays (shared).
- Wrapper `z-index` 40 (as the score bar), below the pass-and-play cover.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `feat: a readable table header (US-106)`.

## Review Focus

- A refused move or bid shows its error in the status line and the next render replaces it.
- Repeated renders with the same text do not rewrite the live region.
- Escape closes the menu and returns focus; the menu closes when a Hint is asked.
- Pass-and-play names the player, never "Your turn".
- Round over and trick collection show the right text; online private table still works.

---

### Task 1: Status model

**Files:** Create `static/table-status.js`; Test `frontend-tests/table-status.test.cjs`.

**Interfaces:** Produces `tableStatus(state): { text: string, args: string[] }` where `state` is `{ phase: "bidding"|"play", complete?, roundOver?, dealing?, reviewingTrick?, trickWinner?, myTurn, activeName, passAndPlay }`; args are player names.

- [ ] **Step 1:** Tests for each state of the spec (priority: roundOver > dealing > reviewingTrick > turn).
- [ ] **Step 2:** Run `node --test crates/beelot-server/frontend-tests`; expect failures. **Step 3:** implement; **Step 4:** pass; commit.

### Task 2: Header markup, wiring and styles

**Files:** Modify `static/index.html`, `static/app.js`, `static/styles.css`, `static/i18n.js`, `static/i18n-nl.js`; extend the test file.

- [ ] **Step 1:** Tests: markup per the spec; script before `app.js`; FR/NL entries; status contrast in four themes.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement: wrapper + bar + menu markup; remove the chips, footer, `#bid-hint-button`, `#hint-button`, `#bidding-message`; `setTableStatus`, `updateTableStatus` from both loaders, `offerHint("#table-hint-button", …)`; menu open/close (button, Escape, outside click); show the bar only for `bot-game`/`bidding`; styles (sticky wrapper, bar, menu, danger divider) and removal of the dead `.game-hud`/`.game-footer` rules.
- [ ] **Step 4:** Run the Node tests; expect pass.
- [ ] **Step 5:** Browser at 375×667 in bidding and play: header stable across the switch, hand fully visible, Hint from the menu, Escape, error text, pass-and-play name; online private table unaffected.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
