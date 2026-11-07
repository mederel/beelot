const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const html = read("index.html");
const app = read("app.js");
const between = (from, to) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from) + 10));
const stats = between('data-view="stats"', 'data-view="privacy"');
const crew = between('data-view="private"', 'data-view="public"');
const settings = between('data-view="settings"', "</main>");

test("Progress has one switcher, one panel at a time, today's goal and the guest offer", () => {
  assert.match(stats, /name="stats-view"[^>]*value="overall"/);
  assert.match(stats, /name="stats-view"[^>]*value="variant"/);
  assert.match(stats, /name="stats-view"[^>]*value="difficulty"/);
  for (const panel of ["overall", "variant", "difficulty"]) assert.ok(stats.includes(`data-stats-panel="${panel}"`), panel);
  assert.ok(stats.includes('id="stats-goal"'));
  assert.ok(stats.indexOf("keep your results") > 0 || stats.includes("Create an account with a passkey to keep your results"));
  assert.ok(app.includes("function showStatsPanel()"));
  assert.ok(app.includes("goal.textContent = goals ? goalText(goals) : \"\";"));
});

test("Crew has six code boxes feeding the hidden field, a Find a game button and the open tables", () => {
  assert.ok(crew.includes('id="code-boxes"'));
  assert.match(crew, /<input id="invitation-code" name="invitationCode" type="hidden">/);
  assert.ok(crew.includes('href="/online/public"'));
  assert.ok(crew.includes('id="crew-open-list"'));
  assert.ok(app.includes("document.querySelector(\"#code-boxes\").append(...codeBoxes);"));
  assert.ok(app.includes('t("Character {0} of 6", index + 1)'));
  assert.ok(app.includes('if (activeView === "private") loadOpenTables();'));
  assert.ok(html.indexOf('src="/code-boxes.js"') < html.indexOf('src="/app.js"'));
  assert.ok(html.indexOf('src="/progress-tabs.js"') < html.indexOf('src="/app.js"'));
});

test("Me keeps the account, the settings and the data tools, and gains the privacy link", () => {
  for (const id of ["account-bar", "reactions-enabled", "bot-comments", "sound-enabled", "your-data", "delete-confirm-word"]) {
    assert.ok(settings.includes(`id="${id}"`), id);
  }
  assert.ok(settings.includes('href="/privacy"'));
});

test("the new texts are translated", () => {
  for (const key of ["Overall", "By bot difficulty", "Character {0} of 6", "Your open tables", "Resume"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
});
