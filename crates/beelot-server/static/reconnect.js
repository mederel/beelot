// The rules of the reconnect button and of the missed-moves line (US-163). It touches no DOM: app-core.js starts the timers and
// shows the results.
"use strict";

// How long the live link of a table has to be down before the "Reconnect now" button shows, and how long the line that says
// how many moves were missed stays on screen.
const BUTTON_DELAY_MS = 10000;
const MISSED_LINE_MS = 5000;

// The moves made while the link was down: the rise of the table's version (every accepted change raises it). Zero when either
// number is missing or the table did not move forward.
function missedMoves(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, after - before);
}

// The translation key of the line and its count, or null when nothing was missed. The caller translates the key and puts `n`
// where `{n}` stands.
function missedLine(count) {
  if (!Number.isInteger(count) || count < 1) return null;
  return count === 1 ? { key: "You missed 1 move", n: 1 } : { key: "You missed {n} moves", n: count };
}

if (typeof module !== "undefined") module.exports = { BUTTON_DELAY_MS, MISSED_LINE_MS, missedMoves, missedLine };
