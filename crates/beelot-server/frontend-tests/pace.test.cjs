const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PACES, BASE_DELAYS, resolvePace, paceDelay } = require("../static/pace.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");

test("every delay is its base times the pace, rounded", () => {
  assert.equal(paceDelay("biddingThink", "normal"), 900);
  assert.equal(paceDelay("biddingThink", "quick"), 450);
  assert.equal(paceDelay("biddingThink", "relaxed"), 1350);
  for (const name of Object.keys(BASE_DELAYS)) {
    for (const pace of Object.keys(PACES)) assert.equal(paceDelay(name, pace), Math.round(BASE_DELAYS[name] * PACES[pace]));
  }
});

test("quick is shorter than normal, relaxed longer, and no delay becomes zero", () => {
  for (const name of Object.keys(BASE_DELAYS)) {
    assert.ok(paceDelay(name, "quick") > 0, name);
    assert.ok(paceDelay(name, "quick") < paceDelay(name, "normal"), name);
    assert.ok(paceDelay(name, "relaxed") > paceDelay(name, "normal"), name);
  }
});

test("an unknown or missing pace is the normal one, an unknown delay is an error", () => {
  assert.equal(resolvePace(null), "normal");
  assert.equal(resolvePace("fast"), "normal");
  assert.equal(resolvePace("constructor"), "normal");
  assert.equal(paceDelay("ownCall", undefined), 1000);
  assert.throws(() => paceDelay("nope", "normal"));
});

test("every delay constant of the table goes through paced(), none is left as a literal", () => {
  const sources = fs.readdirSync(path.join(__dirname, "../static")).filter((f) => /^app.*\.js$/.test(f)).map((f) => [f, read(f)]);
  const all = sources.map(([, s]) => s).join("\n");
  for (const name of Object.keys(BASE_DELAYS)) {
    assert.ok(all.includes(`paced("${name}")`), name);
    assert.ok(!new RegExp(`const ${name}(Delay|Ms)\\b`).test(all), `${name} constant`);
  }
  for (const old of ["biddingThinkDelay", "biddingRevealDelay", "ownCallDelay", "trickRevealDelay", "trickHoldDelay", "trickCollectMs", "dealFlightMs", "dealGapMs"]) {
    assert.ok(!new RegExp(`\\b${old}\\b`).test(all), old);
  }
  assert.match(read("app-core.js"), /function paced\(name\) \{\n  return paceDelay\(name, document\.body\.dataset\.pace\);/);
});

test("the pace is a Settings choice, remembered in the browser, and pace.js loads before the app", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('src="/pace.js"') < html.indexOf('src="/app-core.js"'));
  for (const value of ["relaxed", "normal", "quick"]) assert.ok(html.includes(`<input name="pace" type="radio" value="${value}">`), value);
  const app = read("app.js");
  assert.ok(app.includes('storedSetting("beelot.pace") ?? sessionPace'));
  assert.ok(app.includes('window.localStorage.setItem("beelot.pace", event.target.value);'));
  assert.ok(app.includes("document.body.dataset.pace = pace;"));
});

test("the new texts are translated", () => {
  for (const key of ["Pace", "Choose how fast the bots play and the table moves.", "Normal", "Quick"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
