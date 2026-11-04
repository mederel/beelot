const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const html = read("index.html");
const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot"'));
const PROMISE = "Play Belote with friends or bots. Free, no account needed.";
const OLD_INTRO = "Quick games, clever plays and big table energy.";

test("the home page states the promise under the title and that no account is needed", () => {
  assert.match(home, new RegExp(`<p class="intro">${PROMISE}</p>`));
  assert.ok(home.indexOf("<h1>") < home.indexOf('class="intro"'));
  assert.match(PROMISE, /no account/);
});

test("the remix subtitle is gone from the home page and the dictionaries", () => {
  assert.doesNotMatch(home, /remix/i);
  assert.doesNotMatch(home, /class="eyebrow"/);
  for (const file of ["i18n.js", "i18n-nl.js"]) assert.doesNotMatch(read(file), /remix/i);
});

test("the promise is translated and the old intro is deleted", () => {
  assert.match(read("i18n.js"), /"Play Belote with friends or bots\. Free, no account needed\.":\s*"Jouez à la belote avec des amis ou des bots\. Gratuit, sans compte\."/);
  assert.match(read("i18n-nl.js"), /"Play Belote with friends or bots\. Free, no account needed\.":\s*"Speel belote met vrienden of bots\. Gratis, zonder account\."/);
  assert.doesNotMatch(home, new RegExp(OLD_INTRO));
  for (const file of ["i18n.js", "i18n-nl.js"]) assert.ok(!read(file).includes(OLD_INTRO));
});
