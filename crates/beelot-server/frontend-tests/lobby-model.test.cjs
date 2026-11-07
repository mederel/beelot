const test = require("node:test");
const assert = require("node:assert/strict");
const { lobbyModel } = require("../static/lobby-model.js");

const seat = (position, over = {}) => ({ position, name: `P${position}`, type: "HUMAN", ready: false, you: false, connectionState: "CONNECTED", ...over });
const table = (over = {}) => ({ status: "WAITING_FOR_PLAYERS", publicTable: false, invitationCode: "ABC234", ownerPosition: 0, variant: "CLASSIC", target: 1000, turnTimerSeconds: 0, announcements: true, allTrumps: false, seats: [seat(0, { you: true, ready: true }), seat(1)], ...over });

test("owner sees code, start with bots and rules", () => {
  const m = lobbyModel(table());
  assert.equal(m.showCode, true);
  assert.equal(m.code, "ABC234");
  assert.equal(m.start.shown, true);
  assert.equal(m.start.disabled, true);
  assert.equal(m.startWithBots.shown, true);
  assert.equal(m.startWithBots.disabled, true); // guest not ready
  assert.equal(m.rules.shown, true);
  assert.equal(m.rules.allTrumps, null);
});

test("guest has no owner controls but can get ready", () => {
  const m = lobbyModel(table({ seats: [seat(0), seat(1, { you: true })], ownerPosition: 0 }));
  assert.equal(m.start.shown, false);
  assert.equal(m.startWithBots.shown, false);
  assert.equal(m.rules.shown, false);
  assert.deepEqual(m.ready, { shown: true, on: false });
});

test("spectator has no ready button and cannot sit", () => {
  const m = lobbyModel(table({ seats: [seat(0), seat(1)] }));
  assert.equal(m.ready.shown, false);
  assert.ok(m.seats.every((s) => !s.canSit));
});

test("start needs four ready players", () => {
  const four = [0, 1, 2, 3].map((p) => seat(p, { ready: true, you: p === 0 }));
  const m = lobbyModel(table({ seats: four }));
  assert.equal(m.start.disabled, false);
  assert.equal(m.startWithBots.shown, false);
  const notReady = lobbyModel(table({ seats: four.map((s, i) => (i === 3 ? { ...s, ready: false } : s)) }));
  assert.equal(notReady.start.disabled, true);
});

test("start with bots when every seated human is ready", () => {
  const m = lobbyModel(table({ seats: [seat(0, { you: true, ready: true }), seat(1, { ready: true })] }));
  assert.equal(m.startWithBots.shown, true);
  assert.equal(m.startWithBots.disabled, false);
});

test("empty seats of a private table can be taken by a seated player", () => {
  const m = lobbyModel(table());
  assert.deepEqual(m.seats.map((s) => s.canSit), [false, false, true, true]);
  assert.deepEqual(m.seats.map((s) => s.team), ["North–South", "East–West", "North–South", "East–West"]);
});

test("tout-atout shown for Contrée only", () => {
  const m = lobbyModel(table({ variant: "CONTREE", allTrumps: true }));
  assert.equal(m.rules.allTrumps, true);
  assert.equal(m.summary.allTrumps, true);
});

test("public table: no code, no rules, no start, waiting state", () => {
  const m = lobbyModel(table({ publicTable: true }));
  assert.equal(m.showCode, false);
  assert.equal(m.title, "Looking for players…");
  assert.equal(m.start.shown, false);
  assert.equal(m.rules.shown, false);
  assert.equal(m.publicWaiting, true);
  assert.ok(m.seats.every((s) => !s.canSit));
});

test("connection states", () => {
  const m = lobbyModel(table({ seats: [seat(0, { you: true }), seat(1, { connectionState: "DISCONNECTED" }), seat(2, { connectionState: "BOT_TAKEOVER" })] }));
  assert.deepEqual(m.seats.map((s) => s.connection), ["connected", "disconnected", "bot", null]);
});

test("not waiting: nothing to start", () => {
  const m = lobbyModel(table({ status: "IN_PROGRESS" }));
  assert.equal(m.waiting, false);
  assert.equal(m.ready.shown, false);
  assert.equal(m.start.shown, false);
});
