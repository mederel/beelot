const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveTheme, THEMES } = require("../static/theme.js");

test("lists the four themes with comic first", () => {
  assert.deepEqual(THEMES, ["comic", "classic-green", "midnight", "sunset"]);
});

test("a stored known theme is kept", () => {
  for (const theme of THEMES) assert.equal(resolveTheme(theme), theme);
});

test("nothing stored means comic", () => {
  assert.equal(resolveTheme(null), "comic");
  assert.equal(resolveTheme(undefined), "comic");
});

test("an unknown stored value means comic", () => {
  assert.equal(resolveTheme("banana"), "comic");
  assert.equal(resolveTheme(""), "comic");
  assert.equal(resolveTheme("MIDNIGHT"), "comic");
});

const fs = require("node:fs");
const path = require("node:path");
const { LOCKED_THEMES, unlockedThemes, readUnlockedThemes, saveUnlockedThemes } = require("../static/theme.js");
const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };

test("three locked themes unlock from the totals of the goals ledger", () => {
  assert.deepEqual(Object.keys(LOCKED_THEMES), ["forest", "ruby", "gilded"]);
  assert.deepEqual(unlockedThemes({ played: 0, won: 0 }), []);
  assert.deepEqual(unlockedThemes(null), []);
  assert.deepEqual(unlockedThemes({ played: 1, won: 1 }), ["forest"]);
  assert.deepEqual(unlockedThemes({ played: 24, won: 10 }), ["forest", "ruby"]);
  assert.deepEqual(unlockedThemes({ played: 25, won: 10 }), ["forest", "ruby", "gilded"]);
});

test("an unlock already remembered stays even when the ledger is empty", () => {
  assert.deepEqual(unlockedThemes({ played: 0, won: 0 }, ["ruby"]), ["ruby"]);
  assert.deepEqual(unlockedThemes(null, ["gilded", "banana"]), ["gilded"]);
});

test("a locked theme is only kept once unlocked", () => {
  assert.equal(resolveTheme("forest"), "comic");
  assert.equal(resolveTheme("forest", []), "comic");
  assert.equal(resolveTheme("forest", ["forest"]), "forest");
  assert.equal(resolveTheme("ruby", ["forest"]), "comic");
  assert.equal(resolveTheme("constructor", ["constructor"]), "comic");
});

test("unlocks are remembered in the browser and blocked storage changes nothing", () => {
  const storage = memory();
  assert.deepEqual(readUnlockedThemes(storage), []);
  saveUnlockedThemes(storage, ["forest", "ruby"]);
  assert.deepEqual(readUnlockedThemes(storage), ["forest", "ruby"]);
  storage.setItem("beelot.unlocked-themes", "{oops");
  assert.deepEqual(readUnlockedThemes(storage), []);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readUnlockedThemes(blocked), []);
  assert.doesNotThrow(() => saveUnlockedThemes(blocked, ["forest"]));
});

test("each locked theme has its own swatch, card back and a disabled, described choice", () => {
  const css = read("styles.css");
  const html = read("index.html");
  for (const theme of Object.keys(LOCKED_THEMES)) {
    assert.match(css, new RegExp(`body\\[data-theme="${theme}"\\][^}]*--card-back-a[^}]*--card-back-b`));
    assert.ok(css.includes(`.swatch-${theme} {`), `swatch ${theme}`);
    assert.ok(html.includes(`<input name="theme" type="radio" value="${theme}" data-locked-theme="${theme}">`), `choice ${theme}`);
  }
  const app = read("app.js");
  assert.ok(app.includes("input.disabled = locked;"));
  assert.ok(app.includes('t("Locked: {0}", t(LOCKED_THEMES[theme].hint))'));
  assert.ok(app.includes("resolveTheme(storedSetting(\"beelot.theme\") ?? sessionTheme, themeUnlocks)"));
  assert.ok(read("app-celebrations.js").includes("if (goals) refreshThemeUnlocks();"));
});

test("the new texts are translated", () => {
  const keys = ["Forest", "Ruby", "Gilded", "Locked: {0}", "New theme unlocked: {0}", ...Object.values(LOCKED_THEMES).map((l) => l.hint)];
  for (const key of keys) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
