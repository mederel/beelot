const test = require("node:test");
const assert = require("node:assert/strict");
const { makeToaster, TOAST_MS } = require("../static/toast.js");

function harness() {
  const log = [];
  const timers = new Map();
  let nextId = 1;
  const toaster = makeToaster({
    show: (text, kind) => log.push(["show", text, kind]),
    hide: () => log.push(["hide"]),
    setTimer: (fn, ms) => { timers.set(nextId, { fn, ms }); return nextId++; },
    clearTimer: (id) => timers.delete(id)
  });
  const fire = () => { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.fn(); };
  return { toaster, log, timers, fire };
}

test("the first toast shows at once and lasts as long as its kind", () => {
  const { toaster, log, timers } = harness();
  toaster.push("Belote!", "declaration");
  assert.deepEqual(log, [["show", "Belote!", "declaration"]]);
  assert.equal([...timers.values()][0].ms, TOAST_MS.declaration);
  assert.deepEqual(toaster.current(), { text: "Belote!", kind: "declaration" });
});

test("the same text again does nothing", () => {
  const { toaster, log, timers } = harness();
  toaster.push("Belote!", "declaration");
  toaster.push("Belote!", "declaration");
  assert.equal(log.length, 1);
  assert.equal(timers.size, 1);
});

test("blank text is ignored", () => {
  const { toaster, log } = harness();
  toaster.push("", "hint");
  toaster.push("   ", "hint");
  toaster.push(undefined, "hint");
  assert.deepEqual(log, []);
  assert.equal(toaster.current(), null);
});

test("a higher priority replaces the toast on screen and the replaced one is gone", () => {
  const { toaster, log, fire, timers } = harness();
  toaster.push("Belote!", "declaration");
  toaster.push("Play the ace", "hint");
  assert.deepEqual(log, [["show", "Belote!", "declaration"], ["show", "Play the ace", "hint"]]);
  assert.equal(timers.size, 1);
  fire();
  assert.deepEqual(log.at(-1), ["hide"]);
  assert.equal(toaster.current(), null);
});

test("an equal or lower priority waits for its turn", () => {
  const { toaster, log, fire } = harness();
  toaster.push("Play the ace", "hint");
  toaster.push("Belote!", "declaration");
  assert.equal(log.length, 1);
  fire();
  assert.deepEqual(log.slice(1), [["hide"], ["show", "Belote!", "declaration"]]);
  fire();
  assert.deepEqual(log.at(-1), ["hide"]);
});

test("at most three toasts wait, the oldest waiting one is dropped", () => {
  const { toaster, log, fire } = harness();
  toaster.push("on screen", "hint");
  for (const text of ["a", "b", "c", "d"]) toaster.push(text, "declaration");
  const shown = [];
  for (let i = 0; i < 4; i += 1) { fire(); }
  for (const entry of log) if (entry[0] === "show") shown.push(entry[1]);
  assert.deepEqual(shown, ["on screen", "b", "c", "d"]);
});

test("clear cancels the timer, empties the queue and hides", () => {
  const { toaster, log, timers } = harness();
  toaster.push("one", "hint");
  toaster.push("two", "declaration");
  toaster.clear();
  assert.equal(timers.size, 0);
  assert.deepEqual(log.at(-1), ["hide"]);
  assert.equal(toaster.current(), null);
});

test("clear on an empty toaster does not hide anything", () => {
  const { toaster, log } = harness();
  toaster.clear();
  assert.deepEqual(log, []);
});
