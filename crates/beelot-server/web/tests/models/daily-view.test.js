import { test } from "vitest";
import assert from "node:assert/strict";
import { dailyCard, dailyMineNote, dailyRows } from "$lib/models/small";

test("the card says the variant of the day and whether the deal can be started", () => {
  assert.deepEqual(dailyCard({ variant: "CLASSIC", mine: null }), { variantKey: "Classic Belote", detail: "One deal a day, the same for everyone", values: [], canStart: true });
  assert.equal(dailyCard({ variant: "CONTREE", mine: null }).variantKey, "Contrée");
});

test("a started deal cannot be started again, and a finished one shows the score", () => {
  const started = dailyCard({ variant: "CLASSIC", mine: { score: null, rank: null } });
  assert.equal(started.canStart, false);
  const done = dailyCard({ variant: "CLASSIC", mine: { score: 142, rank: 3 } });
  assert.deepEqual([done.detail, done.values, done.canStart], ["Your score: {0}", [142], false]);
});

test("the board tells the viewer's rank only once they have a score", () => {
  assert.equal(dailyMineNote(null), null);
  assert.equal(dailyMineNote({ score: null, rank: null }), null);
  assert.deepEqual(dailyMineNote({ score: 150, rank: 2 }), { text: "Your rank: {0} ({1})", values: [2, 150] });
  assert.deepEqual(
    dailyRows([
      { rank: 1, name: "Calm Heron", score: 150 },
      { rank: 2, name: "Lucky Otter", score: 120 }
    ]),
    [
      [1, "Calm Heron", 150],
      [2, "Lucky Otter", 120]
    ]
  );
});
