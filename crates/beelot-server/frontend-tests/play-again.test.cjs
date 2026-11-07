const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { rematchView, rematchTexts } = require("../static/match-end.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const seats = [{ name: "Ana" }, { name: "Benoit" }, { name: "Chloe" }, { name: "David" }];
const identity = (text, ...args) => args.reduce((out, arg, i) => out.replace(`{${i}}`, arg), text);

test("nobody has asked for a rematch: the button says Play again and no status shows", () => {
  const view = rematchView({}, seats, 0);
  assert.deepEqual(view, { state: "idle", names: [] });
  assert.deepEqual(rematchTexts(view, identity), { label: "Play again", status: "", disabled: false });
});

test("after my own request the button waits for the others", () => {
  const view = rematchView({ rematchVoted: [0], rematchPending: [1, 3] }, seats, 0);
  assert.deepEqual(view, { state: "waiting", names: ["Benoit", "David"] });
  assert.deepEqual(rematchTexts(view, identity), { label: "Play again", status: "Waiting for Benoit, David…", disabled: true });
});

test("when others asked, the button accepts the rematch", () => {
  const view = rematchView({ rematchVoted: [2], rematchPending: [0, 1] }, seats, 0);
  assert.deepEqual(view, { state: "proposed", names: ["Chloe"] });
  assert.deepEqual(rematchTexts(view, identity), { label: "Accept rematch", status: "Rematch proposed by Chloe", disabled: false });
});

test("the screen has Play again as primary and Change options and Back to home as secondary", () => {
  const html = read("index.html");
  assert.match(html, /<button class="button" id="match-end-play-again"/);
  assert.match(html, /class="button secondary-button" id="match-end-options" href="\/play\/bot" hidden>Change options</);
  assert.match(html, /class="button secondary-button" href="\/">Back to home</);
});

test("the options link is for a solo game only and an online click does not close the screen", () => {
  assert.match(read("match-end.js"), /options"\)\.hidden = !model\.solo/);
  const app = require("./app-source.cjs").appSource();
  assert.match(app, /model\.solo = gameKey\.startsWith\("bot:"\)/);
  const handler = app.slice(app.indexOf('"#private-rematch-button").addEventListener'));
  assert.ok(!handler.slice(0, 200).includes("resetMatchEnd"));
});

test("the new texts are translated", () => {
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of ["Waiting for {0}…", "Rematch proposed by {0}", "Accept rematch", "Change options", "Back to home"]) {
      assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
    }
  }
});
