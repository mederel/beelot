const test = require("node:test");
const assert = require("node:assert/strict");
const { readResume, rememberResume, forgetResume, resumeCard } = require("../static/home-status.js");

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

test("the resume record is written, read and forgotten", () => {
  const storage = memory();
  assert.equal(readResume(storage), null);
  rememberResume(storage, "t1", "tok");
  assert.deepEqual(readResume(storage), { tableId: "t1", playerToken: "tok" });
  forgetResume(storage);
  assert.equal(readResume(storage), null);
});

test("blocked or damaged storage means nothing to resume", () => {
  assert.doesNotThrow(() => { rememberResume(broken, "t", "k"); forgetResume(broken); });
  assert.equal(readResume(broken), null);
  const storage = memory();
  storage.setItem("beelot.resume", "{not json");
  assert.equal(readResume(storage), null);
  storage.setItem("beelot.resume", JSON.stringify({ tableId: 4 }));
  assert.equal(readResume(storage), null);
  rememberResume(storage, "", "tok");
  assert.equal(readResume(storage), null);
});

const solo = (over = {}) => ({ tableId: "t1", you: 0, table: { kind: "LOCAL", passAndPlay: false, variantLabel: "Classic Belote" }, match: { northSouth: 120, eastWest: 80, target: 1000, complete: false }, board: {}, ...over });

test("a solo match in play resumes on the cards, in the auction on its sheet", () => {
  assert.deepEqual(resumeCard(solo()), { path: "/play/bot/game/t1", variantLabel: "Classic Belote", yours: 120, theirs: 80, target: 1000 });
  assert.equal(resumeCard(solo({ board: undefined, bidding: {} })).path, "/play/bot/bidding/t1");
});

test("scores follow the viewer's team", () => {
  const card = resumeCard(solo({ you: 1 }));
  assert.equal(card.yours, 80);
  assert.equal(card.theirs, 120);
});

test("nothing to resume for a complete match, an online table, pass and play or no table", () => {
  assert.equal(resumeCard(solo({ match: { complete: true } })), null);
  assert.equal(resumeCard(solo({ table: { kind: "PRIVATE" } })), null);
  assert.equal(resumeCard(solo({ table: { kind: "LOCAL", passAndPlay: true } })), null);
  assert.equal(resumeCard(solo({ board: undefined })), null);
  assert.equal(resumeCard(null), null);
});
