const test = require("node:test");
const assert = require("node:assert/strict");
const { botCharacter } = require("../static/bot-characters.js");

test("each bot name has its character", () => {
  assert.deepEqual(botCharacter("Camille"), { key: "camille", name: "Camille" });
  assert.deepEqual(botCharacter("Luc"), { key: "luc", name: "Luc" });
  assert.deepEqual(botCharacter("Manon"), { key: "manon", name: "Manon" });
  assert.deepEqual(botCharacter("Hugo"), { key: "hugo", name: "Hugo" });
});

test("other names have no character", () => {
  for (const name of ["You", "Ana", "", "camille", "CAMILLE", " Luc", null, undefined]) {
    assert.equal(botCharacter(name), null, String(name));
  }
});

test("names inherited from Object.prototype have no character", () => {
  assert.equal(botCharacter("toString"), null);
  assert.equal(botCharacter("constructor"), null);
});
