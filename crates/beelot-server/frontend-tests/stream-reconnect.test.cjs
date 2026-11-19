"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeGapTracker, BUTTON_DELAY_MS, MISSED_LINE_MS } = require("../static/reconnect.js");

// A fake clock and a recording view: `advance(ms)` runs the timers that come due, in order.
function rig(versions = { now: 10 }) {  // `now` is the table's moves counter
  let time = 0;
  let next = 1;
  const timers = new Map();
  const events = [];
  const tracker = makeGapTracker({
    setTimer: (callback, ms) => (timers.set(next, { at: time + ms, callback }), next++),
    clearTimer: (id) => timers.delete(id),
    movesOf: () => versions.now,
    view: {
      note: (on) => events.push(`note:${on}`),
      button: (visible, disabled) => events.push(`button:${visible}:${disabled}`),
      line: (line) => events.push(line ? `line:${line.key}:${line.n}` : "line:off"),
    },
  });
  const advance = (ms) => {
    const end = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      time = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    time = end;
  };
  return { tracker, advance, events, timers, versions };
}

test("the note shows after three seconds and the button after ten, not before", () => {
  const { tracker, advance, events } = rig();
  tracker.failed();
  advance(2999);
  assert.deepEqual(events, []);
  advance(1);
  assert.deepEqual(events, ["note:true"]);
  advance(BUTTON_DELAY_MS - 3000 - 1);
  assert.deepEqual(events, ["note:true"]);
  advance(1);
  assert.deepEqual(events, ["note:true", "button:true:false"]);
});

test("a stream that opens before ten seconds leaves no button and no timer behind", () => {
  const { tracker, advance, events, timers } = rig();
  tracker.failed();
  advance(9000);
  assert.ok(tracker.opened());
  assert.equal(timers.size, 0);
  advance(60000);
  assert.deepEqual(events, ["note:true", "note:false", "button:false:false"]);
});

test("a tap disables the button, the note stays, and the next failure enables it again", () => {
  const { tracker, advance, events } = rig();
  tracker.failed();
  advance(BUTTON_DELAY_MS);
  events.length = 0;
  tracker.reconnectRequested();
  assert.deepEqual(events, ["button:true:true"]);
  tracker.failed();
  assert.deepEqual(events, ["button:true:true", "button:true:false"]);
});

test("after a gap that showed the note, the line counts the moves and goes after five seconds", () => {
  const { tracker, advance, events, versions } = rig({ now: 10 });
  tracker.failed();
  advance(5000);
  const ticket = tracker.opened();
  events.length = 0;
  tracker.announce(ticket, 13);
  assert.deepEqual(events, ["line:You missed {n} moves:3"]);
  advance(MISSED_LINE_MS);
  assert.deepEqual(events, ["line:You missed {n} moves:3", "line:off"]);
  assert.equal(versions.now, 10);
});

test("one move reads in the singular", () => {
  const { tracker, advance, events } = rig({ now: 4 });
  tracker.failed();
  advance(4000);
  const ticket = tracker.opened();
  events.length = 0;
  tracker.announce(ticket, 5);
  assert.deepEqual(events, ["line:You missed 1 move:1"]);
});

test("a gap under three seconds shows no note and no line", () => {
  const { tracker, advance, events, timers } = rig();
  tracker.failed();
  advance(2000);
  assert.equal(tracker.opened(), null);
  assert.equal(timers.size, 0);
  advance(60000);
  assert.deepEqual(events, []);
});

test("a table that did not move, or went back, shows no line", () => {
  for (const after of [10, 7, undefined]) {
    const { tracker, advance, events } = rig({ now: 10 });
    tracker.failed();
    advance(5000);
    const ticket = tracker.opened();
    events.length = 0;
    tracker.announce(ticket, after);
    assert.deepEqual(events, [], String(after));
  }
});

test("leaving or a refusal during the gap leaves no button, line or timer, and a late answer shows nothing", () => {
  const { tracker, advance, events, timers } = rig();
  tracker.failed();
  advance(BUTTON_DELAY_MS);
  const ticket = tracker.opened();
  tracker.cleared();
  events.length = 0;
  tracker.announce(ticket, 99);
  assert.deepEqual(events, []);
  assert.equal(timers.size, 0);
  tracker.failed();
  advance(4000);
  tracker.cleared();
  advance(60000);
  assert.equal(timers.size, 0);
  assert.equal(events.filter((e) => e === "button:true:false").length, 0, "no button for a gap cleared before ten seconds");
});

test("a new gap replaces the line still on screen", () => {
  const { tracker, advance, events, versions } = rig({ now: 1 });
  tracker.failed();
  advance(4000);
  tracker.announce(tracker.opened(), 3);
  versions.now = 3;
  tracker.failed();
  assert.ok(events.includes("line:off"), "the old line is withdrawn when a new gap starts");
});

test("the note counts as up from its third second until the stream is open or the table is left", () => {
  const { tracker, advance } = rig();
  tracker.failed();
  advance(2999);
  assert.equal(tracker.isDropped(), false);
  advance(1);
  assert.equal(tracker.isDropped(), true);
  tracker.failed();
  assert.equal(tracker.isDropped(), true, "repeated errors do not postpone or restart the gap");
  tracker.opened();
  assert.equal(tracker.isDropped(), false);
});

test("a line owed to a gap that ended is dropped when a new gap starts before the table was read", () => {
  const { tracker, advance, events } = rig({ now: 10 });
  tracker.failed();
  advance(5000);
  const ticket = tracker.opened();
  tracker.failed();
  events.length = 0;
  tracker.announce(ticket, 14);
  assert.deepEqual(events, [], "the stale answer must not show a line during the new gap");
});
