const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SETUP_STEPS, moveSetupStep } = require("../static/setup-steps.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../static", file), "utf8");

test("steps move by one and stay between 1 and the last step", () => {
  assert.equal(SETUP_STEPS, 3);
  assert.equal(moveSetupStep(1, 1), 2);
  assert.equal(moveSetupStep(3, 1), 3);
  assert.equal(moveSetupStep(1, -1), 1);
  assert.equal(moveSetupStep(2, -1), 1);
});

const html = read("index.html");
const form = html.slice(html.indexOf('id="bot-game-form"'), html.indexOf("</form>", html.indexOf('id="bot-game-form"')));

test("the form is in three steps covering every question", () => {
  assert.match(form, /id="bot-game-form" data-step="1"/);
  assert.match(html, /id="setup-progress"[^>]*role="status"/);
  const stepOf = (legend) => form.match(new RegExp(`<fieldset[^>]*data-setup-step="(\\d)"[^>]*>\\s*<legend>${legend}</legend>`))?.[1];
  assert.equal(stepOf("Game variant"), "1");
  assert.equal(stepOf("Tout-atout and sans-atout"), "1");
  assert.equal(stepOf("Announcements"), "2");
  assert.equal(stepOf("Match target"), "2");
  assert.equal(stepOf("Bot difficulty"), "3");
});

test("Next is the submit button, Back is a text button, jargon is explained", () => {
  assert.match(form, /<button class="button" id="setup-next" type="submit">/);
  assert.match(form, /<button class="text-button" id="setup-back" type="button"/);
  assert.equal(form.match(/<details class="setup-help">/g).length, 2);
  assert.match(form, /<summary>What is this\?<\/summary>/);
  const helpIn = (legend) => new RegExp(`<legend>${legend}</legend>(?:(?!</fieldset>)[\\s\\S])*?<details class="setup-help">`).test(form);
  assert.ok(helpIn("Game variant"), "Contrée help sits with the variant");
  assert.ok(helpIn("Announcements"), "announcements help sits with the announcements");
  assert.ok(!helpIn("Tout-atout and sans-atout"));
});

test("the script loads before app.js and the texts are translated", () => {
  assert.ok(html.indexOf("/setup-steps.js") > 0 && html.indexOf("/setup-steps.js") < html.indexOf("/app.js"));
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    const text = read(file);
    for (const key of ["Step {0} of {1}", "Next", "Back", "What is this?", "Contrée is played with an auction", "Announcements are bonus combinations"]) {
      assert.ok(text.includes(`"${key}`), `${file}: ${key}`);
    }
  }
});
