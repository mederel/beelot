# Reconnect by hand and count the missed moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Reconnect now" button in the connection note after about ten seconds of a dropped table stream, and a short line saying how many moves were missed once the stream is back.

**Architecture:** A pure module (`reconnect.js`) holds the timing constant and the count rules; `app-core.js`'s stream code starts a second timer, shows the button, reopens the stream on tap and writes the line from the version before the gap and the fresh snapshot after it. Client only.

**Tech Stack:** vanilla JS scripts, `node --test` frontend tests, i18n tables for FR and NL, CSS.

**Spec:** `docs/superpowers/specs/2026-11-19-reconnect-and-missed-moves-design.md`

## Global Constraints

- The button shows after `BUTTON_DELAY_MS = 10000` of a down stream; the note itself still shows after 3000 ms (US-142, unchanged).
- The count is `after.version - before.version` of the table's snapshots, never below 0; the line says "moves", for 0 nothing is shown.
- The line hides itself after `MISSED_LINE_MS = 5000`; it is `role="status" aria-live="polite"`, outside the table.
- A reconnect only reads; a move is never sent twice (`api.act` is unchanged).
- Texts exist in English, French and Dutch (FR/NL marked for native review).
- No server change, no storage, no new request.
- Before the pull request: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (the Testcontainers tests need Docker), `node --test crates/beelot-server/frontend-tests/*.test.cjs`.

## Review Focus

- The stream recovers before ten seconds: no button was ever shown, and the note's removal must not leave a stale timer that shows the button later (Task 3 test).
- The stream recovers right after a tap: the button, the note and its timers are all gone, and the count line shows once (Task 3 test).
- The gap was shorter than three seconds (no note shown): no line (Task 3 test).
- The table version did not move, or moved backwards (a stale snapshot): nothing is shown (Task 1 test).
- A refusal (a bot took the seat) or leaving the table during the gap: no button, no line, no timer left (Task 3 test).

---

### Task 1: The pure rules

**Files:**
- Create: `crates/beelot-server/static/reconnect.js`
- Create: `crates/beelot-server/frontend-tests/reconnect.test.cjs`
- Modify: `crates/beelot-server/static/index.html` (a `<script src="/reconnect.js"></script>` line before `/app-core.js`)

**Interfaces:**
- Produces: `BUTTON_DELAY_MS` (10000), `MISSED_LINE_MS` (5000), `missedMoves(before: number, after: number): number`, `missedLine(count: number): { key: string, n: number } | null`; all exported with `module.exports` and global in the browser.

- [ ] **Step 1: Write the failing tests** in `reconnect.test.cjs`: `missedMoves(5, 8) === 3`, `missedMoves(5, 5) === 0`, `missedMoves(8, 5) === 0`, `missedMoves(undefined, 5) === 0`, `missedMoves(5, NaN) === 0`; `missedLine(0) === null`, `missedLine(-2) === null`, `missedLine(1)` deep-equals `{ key: "You missed 1 move", n: 1 }`, `missedLine(3)` deep-equals `{ key: "You missed {n} moves", n: 3 }`; `BUTTON_DELAY_MS === 10000` and `MISSED_LINE_MS === 5000`. Add a test that `index.html` loads `/reconnect.js` before `/app-core.js`.
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/reconnect.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `reconnect.js` with the signatures above (header comment: what it holds and that it touches no DOM) and add the script tag.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add crates/beelot-server/static/reconnect.js crates/beelot-server/static/index.html crates/beelot-server/frontend-tests/reconnect.test.cjs && git commit -m "feat: add the rules of the reconnect button and the missed-moves line"`

### Task 2: Markup, styles and texts

**Files:**
- Modify: `crates/beelot-server/static/index.html` (line 22 area), `crates/beelot-server/static/styles.css` (near `.offline-note`, line ~2563), `crates/beelot-server/static/i18n.js`, `crates/beelot-server/static/i18n-nl.js`
- Test: `crates/beelot-server/frontend-tests/bad-connection.test.cjs`

**Interfaces:**
- Produces: `#connection-reconnect` (a `<button type="button" hidden>` inside `#connection-note`, text "Reconnect now") and `#missed-moves` (a `<p class="missed-moves" role="status" aria-live="polite" hidden>` right after the note, outside any table view).

- [ ] **Step 1: Write the failing tests** in `bad-connection.test.cjs`: `index.html` matches `id="connection-reconnect"` inside the note's element and `id="missed-moves" role="status" aria-live="polite" hidden`; both translation files contain the three keys `"Reconnect now"`, `"You missed 1 move"`, `"You missed {n} moves"` (the existing "the new sentences are translated" test style).
- [ ] **Step 2: Run** `node --test crates/beelot-server/frontend-tests/bad-connection.test.cjs`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the markup, a `.missed-moves` style next to `.offline-note` (same palette, centered, never `position: fixed` over the table) and a button style inside the note that keeps a 44 px touch target, and the FR ("Se reconnecter", "Vous avez manqué 1 coup", "Vous avez manqué {n} coups") and NL ("Nu opnieuw verbinden", "Je hebt 1 zet gemist", "Je hebt {n} zetten gemist") entries.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add crates/beelot-server/static crates/beelot-server/frontend-tests/bad-connection.test.cjs && git commit -m "feat: add the reconnect button and the missed-moves line to the page"`

### Task 3: The stream wiring

**Files:**
- Modify: `crates/beelot-server/static/app-core.js` (the stream drop code, lines ~309-380), `crates/beelot-server/static/offline.js` (a `showReconnectButton(on, { disabled })` and `showMissedLine(text)` beside `showConnectionTrouble`)
- Test: `crates/beelot-server/frontend-tests/bad-connection.test.cjs` and a behaviour test file `crates/beelot-server/frontend-tests/stream-reconnect.test.cjs`

**Interfaces:**
- Consumes: Task 1's `BUTTON_DELAY_MS`, `MISSED_LINE_MS`, `missedMoves`, `missedLine`; Task 2's two elements.
- Produces: in `app-core.js`, `reconnectNow()` (closes and reopens the stream at once with `retry` 1000 and reads the table fresh), and the state `buttonTimer`, `versionBeforeGap`.

- [ ] **Step 1: Write the failing tests.** First check whether the app's scripts can run in a test context (`vm` with a fake `document`, `EventSource` and `setTimeout`, loading `reconnect.js`, `offline.js`, `app-core.js` in order). If yes, `stream-reconnect.test.cjs` drives a fake stream with a fake clock and asserts, as the Review Focus lists: no button before 10 s and a button after; the button gone if the stream opens at 9 s and no timer fires later; tap disables the button and keeps the note, a second error enables it again; after a 5 s gap and a fresh snapshot three versions higher the line says "You missed 3 moves" and hides 5 s later; a gap under 3 s shows no line; the same version and a lower version show no line; a refusal and `closeTableStream()` leave no button, line or pending timer. If the scripts cannot be loaded that way, say so in the ledger and write the same cases as wiring assertions on the source in `bad-connection.test.cjs` (`BUTTON_DELAY_MS` used in `app-core.js`, `clearStreamDropNote` clearing the button timer, the refusal branch calling it, `missedMoves(` and `missedLine(` called after the fresh read).
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** in `openTableStream`'s `error` handler: when the first error starts the three-second timer, also remember `versionBeforeGap = latestSnapshots.get(tableId)?.version` and start `buttonTimer` (`BUTTON_DELAY_MS`) that shows the button; later errors re-enable it. `clearStreamDropNote` clears `buttonTimer` and hides the button. The `open` handler, when `wasDropped`, runs the resync, then (when it resolves) computes `missedLine(missedMoves(versionBeforeGap, latestSnapshots.get(tableId)?.version))` and shows it with `t(key).replace("{n}", n)` for `MISSED_LINE_MS`. `resyncAfterReconnect` returns the promise of `loadOnlineTable` so the count waits for the fresh snapshot. `reconnectNow` is the button's click handler, wired once.
- [ ] **Step 4: Run** the new tests and the whole `node --test crates/beelot-server/frontend-tests/*.test.cjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add crates/beelot-server && git commit -m "feat: reconnect by hand and say how many moves were missed"`

### Task 4: Browser check, backlog and pull request

**Files:**
- Modify: `docs/product-backlog.md` (US-163 "Delivered" paragraph), `README.md` only if a paragraph on the connection note exists (search "connection is slow")

- [ ] **Step 1: Browser check** at 375×667 in Chromium against a real server (`docker compose up -d --wait && cargo run -p beelot-server`, or the in-memory fallback if Docker's network is unavailable): open an online table, cut the network (devtools offline), see the note at 3 s and the button at 10 s, tap it while offline (it stays disabled then enables again), restore the network, see the note go and "You missed N moves" appear and fade. Record what was seen, and what could not be run.
- [ ] **Step 2:** Add the `Delivered:` paragraph to US-163 in the style of US-161/162: spec and plan paths, what was built, deviations (the "moves" wording), what was verified and not (native review of FR/NL, a real phone).
- [ ] **Step 3: Run** the four commands of Global Constraints. Expected: all pass, except tests that need a Docker network if it is unavailable (named in the pull request).
- [ ] **Step 4: Commit and open the pull request** titled `feat: reconnect by hand and count the missed moves`, after `git fetch origin main:main` and a rebase on it; the description lists the commands run and anything not run.
