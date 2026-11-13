const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { explanationsAtStep } = require("../static/review-analysis.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const known = { CASH_MASTER: "Cash a master card", LEAD_TRUMPS: "Lead trumps" };
const entries = [
  { trick: 0, position: 1, seat: 1, reason: "CASH_MASTER" },
  { trick: 0, position: 3, seat: 3, reason: "NEW_CODE" },
  { trick: 1, position: 0, seat: 2, reason: "LEAD_TRUMPS" }
];

test("the reasons of a step are those of its trick, by place in the trick", () => {
  assert.deepEqual([...explanationsAtStep(entries, 1, known)], [[1, "CASH_MASTER"]]);
  assert.deepEqual([...explanationsAtStep(entries, 2, known)], [[0, "LEAD_TRUMPS"]]);
});

test("the deal, a missing answer and a code the client cannot translate give nothing", () => {
  assert.equal(explanationsAtStep(entries, 0, known).size, 0);
  assert.equal(explanationsAtStep(undefined, 1, known).size, 0);
  assert.equal(explanationsAtStep(null, 1, known).size, 0);
  assert.equal(explanationsAtStep(entries, 1, known).has(3), false);
});

test("the review fetches the explanations and offers a Why? button that opens the reason", () => {
  const review = read("round-review.js");
  assert.ok(review.includes("loadExplanations?.().then("));
  assert.ok(review.includes("explanationsAtStep(reviewState.explanations, model.step, hintReasons)"));
  assert.ok(review.includes('button.setAttribute("aria-expanded", String(open));'));
  assert.ok(review.includes("reason.textContent = t(hintReasons[code]);"));
  assert.ok(read("app-core.js").includes("`/api/tables/${tableId}/explanations`"));
  assert.ok(read("app-solo-table.js").includes("soloExplanations(gameId)"));
});

test("every reason code the server can send has a translated text", () => {
  const core = read("app-core.js");
  for (const code of ["LEAD_TRUMPS", "CASH_MASTER", "LEAD_LOW", "GIVE_POINTS", "KEEP_PARTNERS_TRICK", "WIN_CHEAPLY", "THROW_CHEAPEST"]) {
    const text = core.match(new RegExp(`${code}: "([^"]+)"`))?.[1];
    assert.ok(text, code);
    assert.ok(read("i18n.js").includes(`"${text}":`), `fr ${text}`);
    assert.ok(read("i18n-nl.js").includes(`"${text}":`), `nl ${text}`);
  }
  for (const key of ["Why?", "Hide reason"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
