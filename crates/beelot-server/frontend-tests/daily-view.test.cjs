const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { dailyCard, dailyMineNote, dailyRows } = require("../static/daily-view.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const app = require("./app-source.cjs").appSource();

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
  assert.deepEqual(dailyRows([{ rank: 1, name: "Calm Heron", score: 150 }, { rank: 2, name: "Lucky Otter", score: 120 }]), [[1, "Calm Heron", 150], [2, "Lucky Otter", 120]]);
});

test("home has the daily card, the leaderboard its section, and the card starts the table", () => {
  const html = read("index.html");
  assert.match(html, /<a class="resume-card" id="daily-card" href="\/" hidden>/);
  assert.ok(html.indexOf('id="play-now"') < html.indexOf('id="daily-card"'));
  assert.match(html, /<section class="daily-board" id="daily-board" hidden>/);
  assert.ok(html.indexOf('src="/daily-view.js"') < html.indexOf('src="/app-core.js"'));
  assert.ok(app.includes("const access = await api.startDaily();"));
  assert.ok(app.includes('apiJson("/api/daily", jsonRequest("POST", undefined))'));
  assert.ok(app.includes("loadDailyCard();"));
  assert.ok(app.includes("loadDailyBoard();"));
});

test("the new texts are translated", () => {
  const keys = ["Daily deal", "One deal a day, the same for everyone", "Your score: {0}", "Started: finish it or wait for tomorrow's deal", "Day", "Today", "Yesterday", "No score yet for this day."];
  for (const key of keys) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
