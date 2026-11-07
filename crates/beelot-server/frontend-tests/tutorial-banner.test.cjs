const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { TUTORIAL_SEEN_KEY, shouldShowTutorialBanner, tutorialSeen, markTutorialSeen } = require("../static/tutorial-banner.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};
const throwingStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); }
};

test("the banner shows only to a guest who has not seen the tutorial", () => {
  assert.equal(shouldShowTutorialBanner({ seen: false, signedIn: false }), true);
  assert.equal(shouldShowTutorialBanner({ seen: true, signedIn: false }), false);
  assert.equal(shouldShowTutorialBanner({ seen: false, signedIn: true }), false);
  assert.equal(shouldShowTutorialBanner({ seen: true, signedIn: true }), false);
});

test("seen is remembered on the device", () => {
  const storage = memoryStorage();
  assert.equal(TUTORIAL_SEEN_KEY, "beelot.tutorial-seen");
  assert.equal(tutorialSeen(storage), false);
  markTutorialSeen(storage);
  assert.equal(tutorialSeen(storage), true);
});

test("blocked storage never throws and counts as not seen", () => {
  assert.equal(tutorialSeen(throwingStorage), false);
  assert.doesNotThrow(() => markTutorialSeen(throwingStorage));
});

const html = read("index.html");
const home = html.slice(html.indexOf('data-view="home"'), html.indexOf('data-view="bot-game"'));

test("the banner is a labelled aside above the mode cards, hidden until known", () => {
  const banner = home.match(/<aside class="tutorial-banner" id="tutorial-banner"[^>]*>/)[0];
  assert.match(banner, /aria-labelledby="tutorial-banner-title"/);
  assert.match(banner, /\bhidden\b/);
  assert.ok(home.indexOf('id="tutorial-banner"') < home.indexOf('class="mode-grid"'));
  assert.match(home, /id="tutorial-banner-title">New to Belote\? Learn it in 3 minutes</);
  assert.match(home, /<a class="button" href="\/tutorial">Start the tutorial/);
  assert.match(home, /id="tutorial-banner-dismiss"/);
});

test("Learn the basics is a mode card", () => {
  const cards = [...home.matchAll(/<(?:a|button) class="mode-card[^"]*"[^>]*>[\s\S]*?<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
  assert.ok(cards.includes("Learn the basics"));
  assert.ok(!html.includes("Learn the moves"));
});

test("the script loads before app.js and the texts are translated", () => {
  assert.ok(html.indexOf("/tutorial-banner.js") > 0 && html.indexOf("/tutorial-banner.js") < html.indexOf("/app.js"));
  const fr = read("i18n.js");
  const nl = read("i18n-nl.js");
  for (const text of ["New to Belote? Learn it in 3 minutes", "Start the tutorial", "Dismiss", "Learn the basics"]) {
    assert.ok(fr.includes(`"${text}"`), `FR ${text}`);
    assert.ok(nl.includes(`"${text}"`), `NL ${text}`);
  }
  assert.ok(!fr.includes('"Learn the moves"') && !nl.includes('"Learn the moves"'));
});
