const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCode, spreadCode, boxAfterInput, boxAfterBackspace, joinedCode } = require("../static/code-boxes.js");
const { statsPanel, openTables } = require("../static/progress-tabs.js");

test("a code is uppercase letters and digits, at most six", () => {
  assert.equal(normalizeCode(" abc-23x9 "), "ABC23X");
  assert.equal(normalizeCode(null), "");
});

test("typing or pasting spreads over the boxes from the one typed in", () => {
  assert.deepEqual(spreadCode(["", "", "", "", "", ""], 0, "abc234"), ["A", "B", "C", "2", "3", "4"]);
  assert.deepEqual(spreadCode(["A", "", "", "", "", ""], 1, "bc"), ["A", "B", "C", "", "", ""]);
  assert.deepEqual(spreadCode(["A", "B", "C", "D", "E", ""], 4, "zzzz"), ["A", "B", "C", "D", "Z", "Z"]);
  assert.equal(joinedCode(["A", "B", "", "", "", ""]), "AB");
});

test("focus moves on after a character and back on Backspace in an empty box", () => {
  assert.equal(boxAfterInput(2, ["A", "B", "C", "", "", ""]), 3);
  assert.equal(boxAfterInput(5, ["A", "B", "C", "D", "E", "F"]), 5);
  assert.equal(boxAfterInput(2, ["A", "B", "", "", "", ""]), 2);
  assert.equal(boxAfterBackspace(3, ["A", "B", "C", "", "", ""]), 2);
  assert.equal(boxAfterBackspace(2, ["A", "B", "C", "", "", ""]), 2);
  assert.equal(boxAfterBackspace(0, ["", "", "", "", "", ""]), 0);
});

test("one statistics panel shows, overall by default", () => {
  assert.equal(statsPanel("variant"), "variant");
  assert.equal(statsPanel("difficulty"), "difficulty");
  assert.equal(statsPanel("x"), "overall");
  assert.equal(statsPanel(undefined), "overall");
});

const table = (over, status = "IN_PROGRESS", kind = "PRIVATE") => ({ tableId: "t", table: { kind, status, variantLabel: "Classic Belote", seats: [1, 2], ...over }, ...(over.match ? { match: over.match } : {}) });

test("only waiting or running online tables are listed, with the way back", () => {
  const list = openTables([table({}), table({}, "WAITING_FOR_PLAYERS", "PUBLIC"), table({}, "FINISHED"), table({}, "IN_PROGRESS", "LOCAL"), null]);
  assert.deepEqual(list.map((item) => [item.path, item.waiting]), [["/online/private/table/t", false], ["/online/public/table/t", true]]);
  assert.equal(list[0].seated, 2);
  assert.equal(openTables([{ tableId: "t", table: { kind: "PRIVATE", status: "IN_PROGRESS", seats: [] }, match: { complete: true } }]).length, 0);
});
