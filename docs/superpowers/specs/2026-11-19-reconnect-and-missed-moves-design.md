# Design: reconnect by hand and count the missed moves (US-163)

At an online table the stream drops, the connection note of US-142 appears after three seconds, and the browser reopens the
stream by itself with growing pauses (1, 2, 4… up to 30 s). This story gives the player a way to hurry that up, and says what
happened meanwhile. It is client-only.

- **One pure module, `static/reconnect.js`.** It touches no DOM and holds the two rules: when the button shows, and what the
  missed-moves line says. Plain script with the `module.exports` guard, loaded by `index.html` before `app-core.js`, tested with
  `node --test`.
  - `BUTTON_DELAY_MS = 10000`: the button shows once the live link has been down that long.
  - `missedMoves(before, after)`: `Math.max(0, after - before)` for two numbers, `0` when either is not a finite number.
  - `missedLine(count)`: `null` for 0 (or less, or not a number), `{ key: "You missed 1 move", n: 1 }` for 1, and
    `{ key: "You missed {n} moves", n: count }` for more. The keys are translation keys, so FR and NL go through the usual
    `t()`; the caller replaces `{n}` after the translation.
- **Where the count comes from.** The snapshot's `version`, which the server raises on every accepted change (bids, plays, bot
  moves). Chosen over a new `plays` counter, which needs a server change and new contract fixtures. It can overcount a little:
  a spectator joining or leaving also raises the version. So the line says "moves", not "plays", and the story's "You missed 3
  plays" becomes "You missed 3 moves". The version before the gap is `latestSnapshots.get(tableId).version` when the stream
  first fails; the version after it is the one of the snapshot read when the stream is open again.
- **The gap.** The line is for a gap long enough to have shown the note (US-142: three seconds). A blip that recovers sooner
  shows nothing, as before.
- **The button (`#connection-reconnect`).** Inside `#connection-note`, hidden by default. `app-core.js` starts a second timer,
  `BUTTON_DELAY_MS` after the first stream error (the same moment the three-second timer starts), that shows it. A tap:
  1. disables the button (`disabled`), keeps the note's "Retrying…";
  2. closes the stream and opens it again at once, with the first pause, and reads the table fresh (the code of
     `resyncAfterReconnect`, with `{ fresh: true }`);
  3. the button is enabled again at the next stream error, so a reconnect that fails can be tried again.
  It is a real `<button type="button">`: keyboard and screen reader work without extra code. A move is never resent: the tap only
  reads, and moves still go through `api.act`, which checks the table instead of resending.
- **Transitions that do not change (US-142).** The note and the button go away when the stream is open again, when the player
  leaves the table (`closeTableStream` without `keepNote`), and when the server refuses the stream (a bot took the seat).
  `clearStreamDropNote` clears both timers and hides the button with the note.
- **The line (`#missed-moves`).** A `<p class="missed-moves" role="status" aria-live="polite" hidden>` at the top level of the
  page, next to `#connection-note`, so it never sits over the table's cards. When the stream is open again after a shown gap and
  the fresh snapshot is in, the line is written, shown, and hidden again after 5 s (`MISSED_LINE_MS = 5000`); a new gap replaces
  it. Nothing is shown for 0. It is a status, not a toast: it does not wait behind the declarations of the table's toaster.
- **Texts.** English in the source; `i18n.js` (French) and `i18n-nl.js` (Dutch) get "Reconnect now", "You missed 1 move" and
  "You missed {n} moves"-style entries, marked for native review in the story's "Delivered" note, as for earlier texts.
- **No server change, no storage, no new request.** The fresh read is the one `resyncAfterReconnect` already makes.

## Tests

- `frontend-tests/reconnect.test.cjs` (pure): `missedMoves` for equal, higher, lower and non-number inputs; `missedLine` for 0, 1
  and several; the delay constants.
- `frontend-tests/bad-connection.test.cjs` (wiring, in its existing style): the markup (`#connection-reconnect` inside the note,
  `#missed-moves` as a polite status outside it), the button timer and the missed line in `app-core.js`, the translations in
  both files, and that the US-142 transitions are still there (`clearStreamDropNote` after refusal and on leaving).
- A behaviour test of the stream with a fake `EventSource` and fake timers, if the app's scripts can be loaded in a test
  context (the plan checks this first); otherwise the wiring tests above stand in, and the story says so.

## Out of scope

Reconnecting by itself faster, replaying the missed moves, notifications, and a server counter of plays.

## Not verified before the build

The feel on a real phone with the network cut (checked in Chromium with the network switched off, at 375×667), and the FR and NL
wording (native review pending).
