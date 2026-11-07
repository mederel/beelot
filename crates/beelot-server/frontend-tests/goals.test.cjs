const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { goalSummary, goalMessage, goalCelebration, recordResult, loadLedger, saveLedger } = require("../static/goals.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const NOW = new Date(2026, 10, 6, 15, 0).getTime();
const at = (hours) => new Date(2026, 10, 6, hours, 0).getTime();
const yesterday = new Date(2026, 10, 5, 22, 0).getTime();
const win = (when = NOW) => ({ won: true, at: when });
const loss = (when = NOW) => ({ won: false, at: when });

test("the summary counts the streak, the broken streak and today's games (newest first)", () => {
  const summary = goalSummary({ played: 5, won: 4, results: [win(at(14)), win(at(13)), loss(yesterday), win(yesterday)] }, NOW);
  assert.deepEqual(summary, { played: 5, won: 4, streak: 2, brokenStreak: 0, today: 2 });
  const broken = goalSummary({ played: 4, won: 3, results: [loss(at(14)), win(at(12)), win(at(11)), win(at(10))] }, NOW);
  assert.equal(broken.streak, 0);
  assert.equal(broken.brokenStreak, 3);
});

test("goal messages are friendly and in priority order", () => {
  const msg = (state) => goalMessage(goalSummary(state, NOW));
  assert.deepEqual(msg({ played: 0, won: 0, results: [] }), { key: "Your first game awaits", args: [] });
  assert.deepEqual(msg({ played: 2, won: 0, results: [loss(yesterday), loss(yesterday)] }), { key: "First win in sight", args: [] });
  assert.deepEqual(msg({ played: 3, won: 3, results: [win(), win(), win()] }), { key: "{0} wins in a row", args: [3] });
  assert.deepEqual(msg({ played: 3, won: 2, results: [loss(), win(), win()] }), { key: "Great run of {0} wins! Ready for a new one?", args: [2] });
  assert.deepEqual(msg({ played: 3, won: 1, results: [loss(), loss(), win(yesterday)] }), { key: "{0} games today", args: [2] });
  assert.deepEqual(msg({ played: 2, won: 1, results: [loss(yesterday), win(yesterday)] }), { key: "Win the next one to start a streak", args: [] });
  assert.deepEqual(msg({ played: 2, won: 1, results: [win(yesterday), loss(yesterday)] }), { key: "Win again for a streak", args: [] });
});

test("a streak is never punishing: a loss with no streak behind it just invites the next game", () => {
  const text = JSON.stringify(goalMessage(goalSummary({ played: 2, won: 1, results: [loss(yesterday), win(yesterday)] }, NOW)));
  assert.doesNotMatch(text, /lost|lose|fail|broke|over/i);
});

test("the first game and the first win are celebrated once", () => {
  assert.equal(goalCelebration({ played: 0, won: 0 }, true), "firstWin");
  assert.equal(goalCelebration({ played: 0, won: 0 }, false), "firstGame");
  assert.equal(goalCelebration({ played: 2, won: 0 }, true), "firstWin");
  assert.equal(goalCelebration({ played: 2, won: 0 }, false), null);
  assert.equal(goalCelebration({ played: 2, won: 1 }, true), null);
});

test("recording a result adds it once per game signature and keeps the last 20", () => {
  let state = { played: 0, won: 0, results: [], seen: [] };
  state = recordResult(state, "bot:1:250-120", true, NOW);
  state = recordResult(state, "bot:1:250-120", true, NOW);
  assert.equal(state.played, 1);
  assert.equal(state.won, 1);
  for (let i = 0; i < 30; i += 1) state = recordResult(state, `bot:${i + 2}`, i % 2 === 0, NOW);
  assert.equal(state.results.length, 20);
  assert.equal(state.seen.length, 20);
  assert.equal(state.played, 31);
});

test("the ledger lives in storage; a blocked or corrupt storage gives an empty one and never throws", () => {
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  assert.deepEqual(loadLedger(storage), { played: 0, won: 0, results: [], seen: [] });
  const state = recordResult(loadLedger(storage), "g", true, NOW);
  saveLedger(storage, state);
  assert.equal(loadLedger(storage).played, 1);
  memory.set("beelot.goals", "{nope");
  assert.equal(loadLedger(storage).played, 0);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(loadLedger(blocked).played, 0);
  assert.doesNotThrow(() => saveLedger(blocked, state));
});

test("the page loads goals.js and the texts are translated", () => {
  assert.match(read("index.html"), /<script src="\/goals\.js"><\/script>/);
  const keys = ["Your first game awaits", "First win in sight", "{0} wins in a row", "{0} games today", "Win again for a streak",
    "Win the next one to start a streak", "Great run of {0} wins! Ready for a new one?", "First win!", "First game!"];
  for (const file of ["i18n.js", "i18n-nl.js"]) for (const key of keys) assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
});

test("home shows the goal line and the match-end screen carries it", () => {
  assert.match(read("index.html"), /id="goal-line"/);
  assert.match(read("index.html"), /id="match-end-goal"/);
});

test("app.js wires goals: loaded with the account, recorded once at match end, shown on the screen", () => {
  const app = require("./app-source.cjs").appSource();
  assert.match(app, /loadGoals\(account\.signedIn\)/);
  assert.match(app, /model\.goal = goalOutcome\(/);
  assert.match(read("match-end.js"), /First win!/);
});
