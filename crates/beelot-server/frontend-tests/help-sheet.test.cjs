const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "../static", name), "utf8");
const html = read("index.html");
const app = require("./app-source.cjs").appSource();
const sheet = html.slice(html.indexOf('id="help-sheet"'), html.indexOf('id="setup-sheet"'));

test("the help sheet is a labelled modal sheet with a close button, the hint, the card order, the rules and the tutorial", () => {
  assert.match(html, /<dialog class="help-sheet" data-sheet id="help-sheet" aria-labelledby="help-title">/);
  for (const part of ['id="help-title"', 'id="help-close"', 'aria-label="Close"', 'id="help-hint"', 'id="help-card-order"', 'id="help-rules"', 'href="/tutorial"']) {
    assert.ok(sheet.includes(part), part);
  }
  assert.ok(sheet.indexOf("help-hint") < sheet.indexOf("help-card-order") && sheet.indexOf("help-card-order") < sheet.indexOf("help-rules"));
});

test("the table menu has a Help button instead of the rules link, and the setup note has an opener", () => {
  const menu = html.slice(html.indexOf('id="table-menu"'), html.indexOf('class="table-menu-leave"'));
  assert.ok(menu.includes('id="table-help-button"'));
  assert.ok(!menu.includes('href="/rules"'));
  assert.match(html, /<summary>What is this\?<\/summary><button class="text-button" type="button" data-open-help>/);
});

test("the sheet's rules are the rules view's text, cloned without ids, with sections as h3", () => {
  assert.ok(html.includes('<section id="rules-card-order"><h2>Card order</h2>'));
  const body = app.slice(app.indexOf("function helpHeading"), app.indexOf("document.querySelector(\"#table-help-button\")"));
  assert.ok(body.includes("cloneNode(true)"));
  assert.ok(body.includes('removeAttribute("id")'));
  assert.ok(body.includes('createElement("h3")'));
  assert.ok(body.includes('querySelector("#rules-card-order")'));
});

test("/rules opens it over home and closing returns home; from the table it is routed; from setup it comes back to setup", () => {
  assert.match(app, /route\.sheet === "help"/);
  assert.match(app, /openHelpSheet\(\{ routed: false, onClose: \(reason\) => \{ if \(reason === "closed"\) navigate\("\/", \{ replace: true \}\); \} \}\)/);
  assert.match(app, /openHelpSheet\(\{ opener: document\.querySelector\("#table-menu-toggle"\) \}\)/);
  assert.match(app, /if \(reason === "closed"\) openSetupDialog\(\)/);
  assert.ok(app.includes("sheets.isOpen(setupDialog) || sheets.isOpen(helpDialog)"));
});

test("the hint in the sheet presses the menu's hint button and shows only where hints are offered", () => {
  assert.match(app, /sheets\.closeSheet\(helpDialog\);\s*document\.querySelector\("#table-hint-button"\)\.click\(\);/);
  assert.ok(app.includes('document.querySelector("#help-hint").hidden = hint.hidden'));
});

test("the new texts are translated and the sheet is styled", () => {
  for (const key of ["Help", "Open the rules and card order", "Ask for a hint"]) {
    assert.ok(read("i18n.js").includes(`"${key}":`), `fr ${key}`);
    assert.ok(read("i18n-nl.js").includes(`"${key}":`), `nl ${key}`);
  }
  assert.match(read("styles.css"), /\.help-sheet\s*\{/);
});
