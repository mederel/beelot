# Celebrate great moments (US-090) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a cartoon sticker, confetti or stars and a synthesised sound when the viewer's team does something great (capot, coinche won, defended, round won, match won, belote/rebelote) or breaks its own contract.

**Architecture:** A new `static/celebrations.js` has a pure part (`momentsForRound`, `momentForBelote`, the `MOMENTS` table) tested in Node, and a thin DOM part (`celebrate`). `sounds.js` gains five sounds. `app.js` gets one entry point, `celebrateRound`, replacing the sound-only result calls in the private-table and local/bot flows, plus a belote hook. Frontend only: no server change, no dependency.

**Tech Stack:** Plain browser JavaScript and CSS in `crates/beelot-server/static/`, Node's built-in test runner (`node --test crates/beelot-server/frontend-tests/`).

**Spec:** `docs/superpowers/specs/2026-11-04-celebrations-design.md`

## Global Constraints

- Frontend only (`crates/beelot-server/static/`): no server change, no new dependency, no new Settings option.
- Only the viewer's team is celebrated; the viewer's team is `board.currentPlayerIndex % 2` (0 = North–South, 1 = East–West), as `soundAfterTrick`'s callers already use.
- One sticker per round end; other applicable moments are chips. Sticker lifetime is 1.8 s (fixed timer); it never delays an action; `pointer-events: none`.
- Effects levels follow US-094: Full animates; Reduced fades in within `--effect-fast` and stays still, no confetti; Off appears at once, still, no confetti. The sticker is kept at every level.
- Sounds play whatever the effects level; they honour the Sound setting only (`playSound`).
- Every new text goes through `t()` with French (`i18n.js`) and Dutch (`i18n-nl.js`) entries.
- `celebrations.js` must load in Node (no DOM access at top level), exporting through `if (typeof module !== "undefined")`.
- Pacing delays (`revealMs + 500`) are unchanged.
- Commits are signed, one per task, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A round whose contract my team failed must never also show "Round won!", even if its awarded points tie or exceed the opponents'; the sticker is `contractLost` alone.
- Reloading a game mid-round with a belote message already on the board must not celebrate it (the first message seen for a game is not new); the same message rendered twice must not celebrate twice.
- Belote team detection by player name: a name that is a prefix of another (`Al` and `Alex`), and names with regular-expression characters (`A.B`, `(x)`), must resolve to the right seat.
- A viewer in no team (`myTeam` null), a `capotTeam` of `""` or `null`, and a match with no `target` or no `winner` must produce no sticker and no error.
- A second celebration while one is showing replaces it (one `.celebration` in the DOM), and leaving the table leaves no element behind.

---

### Task 1: The moments (pure logic)

**Files:**
- Create: `crates/beelot-server/static/celebrations.js`
- Create: `crates/beelot-server/frontend-tests/celebrations.test.cjs`
- Modify: `docs/superpowers/specs/2026-11-04-celebrations-design.md` (Belote and rebelote section)

**Interfaces:**
- Produces, exported from `celebrations.js`:
  - `MOMENTS`: object keyed by kind (`matchWin`, `capot`, `coincheWon`, `defended`, `roundWon`, `contractLost`, `belote`, `rebelote`), each `{ text, effect, sound }`. `text` is the English sticker text from the spec table (`"Victory!"`, `"Capot!"`, `"Coinche!"`, `"Down!"`, `"Round won!"`, `"Down!"`, `"Belote!"`, `"Rebelote!"`); `effect` is `"large-confetti" | "confetti" | "stars" | "light-confetti" | "none"` (matchWin large-confetti, capot confetti, coincheWon stars, defended confetti, roundWon light-confetti, contractLost none, belote and rebelote none); `sound` is the `sounds.js` key (`matchWin`, `capot`, `coincheWon`, `defended`, `roundWin`, `contractLost`, `belote`, `belote`).
  - `momentsForRound({ round, board, match, myTeam }) -> { sticker, chips } | null`. `sticker` is a kind from `MOMENTS`; `chips` is an array of `{ kind, text }` where `kind` is a moment kind, `"belote"` or `"points"`; `text` is the English chip text (the moment's sticker text, `"Belote ✓"`, or `"+250"`). `myTeam` is 0, 1 or null; returns null when `myTeam` is null.
  - `momentForBelote({ message, previousMessage, seats, myTeam }) -> "belote" | "rebelote" | null`. `seats` is `board.seats` (`{ name, team }`); `team` is `"North–South"` or `"East–West"`.

- [ ] **Step 1: Amend the spec.** In the "Belote and rebelote" section, replace "`declarationMessage` is the trigger" with: the trigger is a `declarationMessage` that differs from the previous one seen for that game (the first one seen for a game is ignored, so a reload does not celebrate). The declaring team is the `team` of the seat whose `name` followed by `" declares"` starts the message; `momentForBelote({ message, previousMessage, seats, myTeam })`.

- [ ] **Step 2: Write the failing tests** in `celebrations.test.cjs` (`node:test`, `node:assert/strict`, requiring `../static/celebrations.js`). A small `round(overrides)` helper builds a result with `contractMade`, `capotTeam: ""`, `northSouthAwarded`, `eastWestAwarded`, `northSouthBeloteBonus: 0`, `eastWestBeloteBonus: 0`, and a `board(overrides)` helper with `declaringTeam`, `coinched: false`, `variant: "CLASSIC"`, `contractValue: 0`. Tests, each asserting the exact `sticker` and `chips`:
  - `matchWin` outranks everything: `match = { complete: true, winner: "North–South" }`, `myTeam` 0, a capot round, sticker `matchWin`, chips start with `capot`.
  - capot for my team: `capotTeam` is mine, sticker `capot`, chips end with `{ kind: "points", text: "+250" }`; in `CONTREE` when I declared with `contractValue` 80 the chip is `"+330"`.
  - `coincheWon` in both directions: coinched and I declared and made it; coinched and the opponents declared and failed. A coinched contract I declared and failed is `contractLost`.
  - `defended`: opponents declared, not coinched, failed.
  - `roundWon` when my awarded score equals theirs (the tie wins, as `roundSound` does).
  - **Review focus:** `contractLost` alone: I declared and failed while `northSouthAwarded === eastWestAwarded`; sticker `contractLost`, no `roundWon` among chips.
  - a belote bonus for my team adds `{ kind: "belote", text: "Belote ✓" }` as a chip, and one for the opponents does not.
  - the opponents' capot, an opponent-only round win and a lost match give `null`.
  - **Review focus:** `myTeam: null` gives `null`; `capotTeam: null` and a `match` with no `target` or `winner` throw nothing and give the sticker of the other rules.
  - `momentForBelote`: `"Ann declares Belote."` for my team gives `"belote"`; `"Ann declares Rebelote: 20 bonus points."` gives `"rebelote"`; the opponents' declaration gives `null`; `message === previousMessage` gives `null`; `previousMessage === undefined` gives `null` (first message seen); an empty message gives `null`.
  - **Review focus:** seats named `Al` and `Alex` (one per team): `"Alex declares Belote."` resolves to Alex's team; seats named `A.B` and `(x)` resolve correctly.

- [ ] **Step 3: Run the tests to verify they fail.**
  Run: `node --test crates/beelot-server/frontend-tests/celebrations.test.cjs`
  Expected: FAIL (`Cannot find module '../static/celebrations.js'`).

- [ ] **Step 4: Implement the pure part of `celebrations.js`** with the Interfaces above and the header comment style of `score-bar.js`. Moment rules, with `mine = ["North–South", "East–West"][myTeam]` and `declaringMine = board.declaringTeam === mine`: `matchWin` when `match?.complete && match.winner === mine`; `capot` when `round.capotTeam === mine`; `coincheWon` when `board.coinched && (declaringMine ? round.contractMade : !round.contractMade)`; `defended` when `!declaringMine && !round.contractMade && !board.coinched`; `roundWon` when my awarded score is at least the opponents'; `contractLost` when `declaringMine && !round.contractMade`, which replaces the sticker and drops every chip except `belote`. Otherwise the sticker is the first applicable of that order and the rest are chips in order, then the `points` chip when `capot` applies (250, plus `board.contractValue` when `board.variant === "CONTREE" && declaringMine`), then the `belote` chip. `momentForBelote` finds the seat with `message.startsWith(\`${seat.name} declares\`)`, preferring the longest matching name, and no regular expression.

- [ ] **Step 5: Run the tests to verify they pass.**
  Run: `node --test crates/beelot-server/frontend-tests/celebrations.test.cjs`
  Expected: PASS.

- [ ] **Step 6: Commit.**
  `git add crates/beelot-server/static/celebrations.js crates/beelot-server/frontend-tests/celebrations.test.cjs docs/superpowers/specs/2026-11-04-celebrations-design.md && git commit -m "feat: decide which moments to celebrate (US-090)"`

---

### Task 2: The sounds

**Files:**
- Modify: `crates/beelot-server/static/sounds.js`
- Create: `crates/beelot-server/frontend-tests/celebration-sounds.test.cjs`

**Interfaces:**
- Consumes: `MOMENTS` from Task 1.
- Produces: `sounds` entries `capot`, `coincheWon`, `defended`, `belote`, `contractLost`, and a Node export `{ sounds }` from `sounds.js`.

- [ ] **Step 1: Write the failing test** `celebration-sounds.test.cjs`: for every kind in `MOMENTS`, `sounds[MOMENTS[kind].sound]` is a function; and each new sound called with a stub context records at least one `createOscillator` or `createBufferSource` call and throws nothing. The stub context provides `currentTime`, `sampleRate`, `destination`, and `createOscillator`, `createGain`, `createBiquadFilter`, `createBuffer`, `createBufferSource` returning chainable no-op nodes (`connect` returns its argument; `frequency`, `gain` and `Q` expose `setValueAtTime` and `exponentialRampToValueAtTime`).

- [ ] **Step 2: Run it to verify it fails.**
  Run: `node --test crates/beelot-server/frontend-tests/celebration-sounds.test.cjs`
  Expected: FAIL (`sounds` is not exported).

- [ ] **Step 3: Add the five sounds to the `sounds` table** in the existing style (`tone`, `noise`, `arpeggio`), each at most 0.9 s: `capot` a rising run of four to five notes; `coincheWon` the `coinche` hit followed by a three-note arpeggio; `defended` a bright two-note pair; `belote` a two-note chime (`tone` at 784 then 1047); `contractLost` a low two-step "wah-wah" (triangle, 262 falling to 220, then 220 falling to 175). Add `if (typeof module !== "undefined") module.exports = { sounds };` at the end of `sounds.js`.

- [ ] **Step 4: Run it to verify it passes.**
  Run: `node --test crates/beelot-server/frontend-tests/`
  Expected: PASS (all frontend tests).

- [ ] **Step 5: Commit.**
  `git add crates/beelot-server/static/sounds.js crates/beelot-server/frontend-tests/celebration-sounds.test.cjs && git commit -m "feat: add the celebration sounds (US-090)"`

---

### Task 3: The sticker (DOM, CSS, texts)

**Files:**
- Modify: `crates/beelot-server/static/celebrations.js` (the DOM part)
- Modify: `crates/beelot-server/static/styles.css`
- Modify: `crates/beelot-server/static/index.html` (add `<script src="/celebrations.js"></script>` after `/score-bar.js`, before `/app.js`)
- Modify: `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`

**Interfaces:**
- Consumes: `MOMENTS`, `playSound`, `t`.
- Produces: `celebrate(table, kind, chips = [])`, where `table` is a `.card-table` element, `kind` a key of `MOMENTS`, `chips` the array of `momentsForRound`. It removes any existing `.celebration` in `table`, appends one new `.celebration` (`aria-hidden="true"`, `data-effect` set to the moment's `effect`, `data-kind` to its kind) holding `.celebration-sticker`, a `.celebration-chips` list and 14 `<i>` confetti pieces (none when the effect is `"none"`), plays the moment's sound, and removes the element after 1800 ms with `window.setTimeout`.

- [ ] **Step 1: Implement `celebrate`** in `celebrations.js`, guarded so the file still loads in Node (it touches `document` and `window` only inside the function). Texts go through `t()`; confetti pieces get per-piece custom properties (`--x`, `--r`, `--hue` from a fixed palette of the table's colours `--gold`, `--pink`, `--aqua`, `--violet`, `--red`) assigned from the index, so there is no randomness to test.

- [ ] **Step 2: Write the CSS** in `styles.css`, next to the other effect rules. The mockup chosen with the user: a tilted sticker (`rotate(-6deg)`), `--gold` background, `var(--card-ink)` 4px outline, 6px hard shadow, uppercase 900-weight text, radius 18px, centred over the table (`position: absolute`, inside `.card-table`, which is already `position: relative; overflow: hidden`), chips in white pills under it, `z-index` above the trick and below the hand and buttons, `pointer-events: none`. Per kind: `data-kind="contractLost"` is grey-blue and droops (a `translateY` and a small rotation), `data-effect="stars"` uses ★ pieces instead of rectangles. Keyframes follow the US-094 patterns: at Full a pop-in/wobble/fade-out of 1.8 s and falling confetti using `transform` and `opacity` only; `body[data-effects="reduced"]` gives the sticker `animation: fade-in var(--effect-fast) both` and hides the confetti; `body[data-effects="off"]` removes every animation and hides the confetti.

- [ ] **Step 3: Add the texts** to `i18n.js` (French) and `i18n-nl.js` (Dutch): `"Victory!"`, `"Capot!"`, `"Coinche!"`, `"Down!"`, `"Round won!"`, `"Belote!"`, `"Rebelote!"`, `"Belote ✓"`, in the "Game board (client-built)" group beside `"Contract failed"`. French: Victoire !, Capot !, Coinche !, Chute !, Manche gagnée !, Belote !, Rebelote !, Belote ✓. Dutch: Overwinning!, Capot!, Coinche!, Down!, Ronde gewonnen!, Belote!, Rebelote!, Belote ✓. Flag in the PR that the French and Dutch wording needs a native check.

- [ ] **Step 4: Verify in the browser** with a throwaway call (`celebrate(document.querySelector("#bot-card-table"), "capot", [{ kind: "belote", text: "Belote ✓" }, { kind: "points", text: "+250" }])` in the console of the running server): the sticker appears over the trick, the confetti falls, the element is gone after 1.8 s, a second call during the first leaves one `.celebration`, and at effects Reduced and Off the sticker is still and has no confetti. Run `node --test crates/beelot-server/frontend-tests/` and expect PASS.

- [ ] **Step 5: Commit.**
  `git add crates/beelot-server/static && git commit -m "feat: show the celebration sticker (US-090)"`

---

### Task 4: Wire the celebrations into the game

**Files:**
- Modify: `crates/beelot-server/static/app.js` (the private-table result block near line 895-905, the local/bot result block near line 1090-1101, `soundAfterTrick` near line 1494, and the two `declarationMessage` renders near lines 876 and 1071)

**Interfaces:**
- Consumes: `momentsForRound`, `momentForBelote`, `celebrate`, `playSound`, `roundSound`, `soundAfterTrick`.
- Produces: `celebrateRound(trickContainer, tableElement, { round, board, match })` and `celebrateBelote(tableElement, gameKey, board)` in `app.js`.

- [ ] **Step 1: Add `celebrateRound`** beside `soundAfterTrick`: it waits the same delay (`Number(container.dataset.revealMs || 0)`, plus 500 when non-zero), calls `momentsForRound` with `myTeam = board.currentPlayerIndex % 2`, and then `celebrate(tableElement, sticker, chips)` when there is a sticker. With no sticker it plays what the code played before: `roundSound(round, northSouth)` for a round and `"roundLose"` for a lost match. A match win goes through `momentsForRound` as well, so `matchWin` replaces the old direct `"matchWin"` sound.

- [ ] **Step 2: Replace the two `soundAfterTrick` result calls** (private table: `#private-card-table`, `#private-current-trick`; local/bot: `#bot-card-table`, `#current-trick`) with `celebrateRound`. `soundAfterTrick` stays only if another caller needs it; remove it otherwise.

- [ ] **Step 3: Add `celebrateBelote`**: keeps a `Map` from game key to the last `declarationMessage` seen, calls `momentForBelote` with `previousMessage` from that map, stores the new message, and calls `celebrate(tableElement, kind)` for a result. Call it from the two places that render `declarationMessage` (private key: the table id; local key: `gameId`). The message is stored even when it gives `null`, so a reload mid-round does not celebrate.

- [ ] **Step 4: Run the frontend and workspace checks.**
  Run: `node --test crates/beelot-server/frontend-tests/ && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --workspace`
  Expected: all pass (Docker must be running for the database tests).

- [ ] **Step 5: Commit.**
  `git add crates/beelot-server/static/app.js && git commit -m "feat: celebrate rounds, coinches and belotes at the table (US-090)"`

---

### Task 5: Verify in the browser

**Files:**
- Modify: `docs/superpowers/plans/2026-11-04-celebrations.md` (a "Findings" section at the end)

- [ ] **Step 1: Start the server** (`docker compose up -d --wait && cargo run -p beelot-server`) and play a local bot game and a private table with bots until each of these has happened, or stage it from a recorded deal in `fixtures/`: a won round, a defended contract, a lost contract of my own, a coinche won, a capot, a belote and a rebelote, and a match win. Record which were seen live and which were staged.

- [ ] **Step 2: Check every case at effects Full, Reduced and Off** on a phone width (375 px), a tablet and a desktop: the sticker never covers the hand or the "Next round" button, taps pass through it, the sticker leaves by 1.8 s, confetti only at Full, and the sound plays at all three levels and not when Sound effects is off. Check pass-and-play (each team's moments on its own turn to look) and an opponent's capot or belote (no sticker).

- [ ] **Step 3: Check the two reload cases:** reload the page mid-round after a belote (no celebration), and leave the table while a sticker shows (no element left behind, no console error).

- [ ] **Step 4: Record the findings** in a "Findings" section at the end of this plan, run the three commands of `AGENTS.md` once more (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`) plus `node --test crates/beelot-server/frontend-tests/`, and commit: `git add docs/superpowers/plans/2026-11-04-celebrations.md && git commit -m "docs: record the US-090 browser checks"`.

- [ ] **Step 5: Open the pull request** after `git fetch origin main:main` and a rebase on it, titled `feat: celebrate great moments (US-090)`, with the commands run, anything not run, and the note that the French and Dutch wording needs a native check. Then enable auto-merge with `gh pr merge --auto --squash`.

---

## Findings (browser checks, 2026-11-04)

Checked in Chromium (Firefox and Safari not available here) against the running server, on a local bot game.

- **Live:** my team failed its contract in a real round: the grey "Down!" (`contractLost`) sticker appeared 1.4 s after the result, after the trick reveal, with no confetti. The auto-player was crude, so a live capot, coinche or belote did not come up.
- **Staged** through the real `momentsForRound` → `celebrate` path (data built by hand): round won, capot with belote and points chips, coinche won, defended, match win (sticker, chips, 14 pieces and the right sound each), and an opponents' capot (nothing).
- **Belote watcher** (`celebrateBelote`): the first message seen is ignored, a repeat is ignored, my team's rebelote is celebrated, an opponent's belote is not.
- **Effects levels:** Full animates (`celebration-pop`, or `celebration-droop` for a lost contract, 1.8 s) and shows confetti; Reduced fades in over 150 ms with no confetti; Off has no animation and no confetti; the sticker stays visible at all three. A bug found here and fixed: the `contractLost` droop rule beat the Reduced rule on specificity.
- **Layout and input:** at 375 px the sticker fits with no horizontal scroll, and `elementFromPoint` finds the card under it (taps pass through). It sits over the trick for 1.8 s, as designed. A second celebration replaces the first (one element), and the element is gone after 1.8 s.
- **Texts:** French and Dutch render as written; the wording still needs a native check.
- **Not verified:** a live private table (needs an account with a passkey); a live pass-and-play game; Firefox and Safari; the sound by ear (only that the right sound name is played, and that every sound builds nodes against a stub context); a phone-sized check of the Reduced and Off levels.
- **Test noise:** the auto-player produced 409 responses by clicking out of turn; that is the harness, not the app. The browser cached an old `app.js` until refetched, so a hard reload is needed after upgrading.
- **Commands:** `node --test crates/beelot-server/frontend-tests/` (154 pass), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` (clean), `cargo test --workspace` (616 pass, Docker running).
