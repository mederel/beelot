const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { OFFER_KEY, emptyOffer, countMatch, shouldOffer, dismissOffer, loadOffer, saveOffer } = require("../static/account-offer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

test("a guest is offered an account at the first finished match, a signed-in player never", () => {
  const state = countMatch(emptyOffer(), "bot:1:1000-800");
  assert.equal(shouldOffer(state, false), true);
  assert.equal(shouldOffer(state, true), false);
});

test("a match is counted once", () => {
  let state = countMatch(emptyOffer(), "a");
  state = countMatch(state, "a");
  assert.equal(state.matches, 1);
  assert.equal(countMatch(state, "b").matches, 2);
});

test("a dismissed offer stays away for three more matches", () => {
  let state = dismissOffer(countMatch(emptyOffer(), "a"));
  assert.equal(shouldOffer(state, false), false);
  state = countMatch(state, "b");
  state = countMatch(state, "c");
  assert.equal(shouldOffer(state, false), false);
  state = countMatch(state, "d");
  assert.equal(shouldOffer(state, false), true);
});

test("the state lives on the device; corrupt or blocked storage never throws", () => {
  const storage = memoryStorage();
  assert.equal(OFFER_KEY, "beelot.account-offer");
  saveOffer(storage, dismissOffer(countMatch(emptyOffer(), "a")));
  assert.deepEqual(loadOffer(storage), { matches: 1, dismissedAt: 1, last: "a" });
  storage.setItem(OFFER_KEY, "{nope");
  assert.deepEqual(loadOffer(storage), emptyOffer());
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadOffer(blocked), emptyOffer());
  assert.doesNotThrow(() => saveOffer(blocked, emptyOffer()));
});

test("the page has the offer card, loads the script, and the texts are translated", () => {
  const html = read("index.html");
  assert.match(html, /id="match-end-offer"/);
  assert.match(html, /<script src="\/account-offer\.js"><\/script>/);
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    for (const key of ["Keep this result: create an account with a passkey.", "Not now"]) {
      assert.ok(read(file).includes(`"${key}"`), `${file}: ${key}`);
    }
  }
});

test("only a live match end of a guest offers an account, and the existing passkey warning opens", () => {
  const app = read("app.js");
  assert.match(app, /model\.offer = /);
  assert.match(app, /showSignUpWarning\(true\)/);
  assert.match(read("match-end.js"), /offer"\)\.hidden = !model\.offer/);
});
