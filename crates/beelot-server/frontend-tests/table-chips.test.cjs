const test = require("node:test");
const assert = require("node:assert/strict");
const { tableChips } = require("../static/table-chips.js");

const label = {
  own: (announcements) => `Declare: ${announcements.map((a) => a.kind).join(", ")}`,
  name: (announcement) => announcement.kind,
  detail: (player, announcement) => `${player}: ${announcement.kind}`
};
const tierce = { kind: "TIERCE", cards: [] };
const belote = { kind: "BELOTE", cards: [] };
const board = (extra) => ({ currentPlayer: "Emile", ownAnnouncements: [], revealedAnnouncements: [], completedTricks: 0, reviewingCompletedTrick: false, ...extra });

test("a round without announcements has no toggle and no chips", () => {
  assert.deepEqual(tableChips(board(), label), { declare: null, chips: [] });
});

test("before the reveal the chips are the player's own announcements", () => {
  const result = tableChips(board({ ownAnnouncements: [tierce, belote] }), label);
  assert.deepEqual(result.declare, { label: "Declare: TIERCE, BELOTE" });
  assert.deepEqual(result.chips.map((chip) => [chip.text, chip.scored]), [["TIERCE", false], ["BELOTE", false]]);
  assert.equal(result.chips[0].detail, "Emile: TIERCE");
});

test("at the reveal the chips are everyone's, scored ones marked", () => {
  const revealed = [
    { player: "Ann", team: "North-South", scored: true, announcements: [tierce] },
    { player: "Bob", team: "East-West", scored: false, announcements: [belote] }
  ];
  const result = tableChips(board({ ownAnnouncements: [tierce], revealedAnnouncements: revealed, completedTricks: 1, reviewingCompletedTrick: true }), label);
  assert.deepEqual(result.chips.map((chip) => [chip.text, chip.scored]), [["TIERCE", true], ["BELOTE", false]]);
  assert.equal(result.chips[1].detail, "Bob: BELOTE");
});

test("the revealed chips stay once the review is over", () => {
  const revealed = [{ player: "Ann", team: "North-South", scored: true, announcements: [tierce] }];
  const result = tableChips(board({ revealedAnnouncements: revealed, completedTricks: 2 }), label);
  assert.equal(result.chips.length, 1);
  assert.equal(result.declare, null);
});

test("revealed announcements are not shown before the first trick is reviewed", () => {
  const revealed = [{ player: "Ann", team: "North-South", scored: true, announcements: [tierce] }];
  const result = tableChips(board({ ownAnnouncements: [belote], revealedAnnouncements: revealed, completedTricks: 0 }), label);
  assert.deepEqual(result.chips.map((chip) => chip.text), ["BELOTE"]);
});

test("chip ids are stable for the same board", () => {
  const input = board({ ownAnnouncements: [tierce, belote] });
  assert.deepEqual(tableChips(input, label).chips.map((c) => c.id), tableChips(input, label).chips.map((c) => c.id));
  assert.notEqual(tableChips(input, label).chips[0].id, tableChips(input, label).chips[1].id);
});
