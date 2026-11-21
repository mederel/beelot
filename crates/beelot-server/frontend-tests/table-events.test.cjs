const test = require("node:test");
const assert = require("node:assert/strict");
const { spokenEvent, streamMessage } = require("../static/table-events.js");

const send = (event) => JSON.stringify(event);

test("calls, cards, tricks, rounds and matches are spoken, the rest is not", () => {
  const callCode = { code: "call-bid", params: { value: "80", trump: "HEARTS" } };
  assert.deepEqual(spokenEvent({ type: "call", seat: 1, player: "Luc", call: "80 Hearts", callCode }), { type: "call", player: "Luc", call: callCode });
  assert.deepEqual(spokenEvent({ type: "card", player: "Ana", card: { rank: "K", suit: "SPADES" } }), { type: "card", player: "Ana", card: { rank: "K", suit: "SPADES" } });
  assert.deepEqual(spokenEvent({ type: "trick", winner: "Ana", seat: 0, points: 12 }), { type: "trick", winner: "Ana" });
  assert.deepEqual(spokenEvent({ type: "round", made: false }), { type: "round", made: false });
  assert.deepEqual(spokenEvent({ type: "match", winner: "East–West" }), { type: "match", winner: "East–West" });
  for (const type of ["joined", "deal", "readySet", "changed", "disconnected"]) assert.equal(spokenEvent({ type }), null);
});

test("an event carries its number, and the table only when it is the last of a batch", () => {
  const plain = streamMessage("event", send({ type: "card", seq: 7, player: "Ana", card: {} }), "7");
  assert.equal(plain.id, 7);
  assert.equal(plain.state, null);
  assert.equal(plain.spoken.length, 1);
  const last = streamMessage("event", send({ type: "joined", seq: 8, state: { tableId: "t", version: 3 } }), "8");
  assert.equal(last.id, 8);
  assert.deepEqual(last.state, { tableId: "t", version: 3 });
  assert.deepEqual(last.spoken, []);
});

test("a snapshot is the table itself, numbered by its message id, and says nothing aloud", () => {
  const message = streamMessage("snapshot", send({ tableId: "t", version: 1 }), "12");
  assert.equal(message.id, 12);
  assert.deepEqual(message.state, { tableId: "t", version: 1 });
  assert.deepEqual(message.spoken, []);
  assert.equal(streamMessage("snapshot", send({ tableId: "t" }), "").id, null);
});
