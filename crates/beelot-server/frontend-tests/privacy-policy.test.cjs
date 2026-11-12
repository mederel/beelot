const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { policyView, fillPolicy, renderPolicy } = require("../static/privacy-policy.js");

const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/privacy-policy.json"), "utf8"));
const info = {
  controller: "Acme", contact: "privacy@acme.test", hostingProvider: "Hostco",
  hostingAgreement: "DPA signed", backupRetentionDays: 14
};

const allTexts = (entry) => [entry.en, entry.fr, entry.nl];
const everyEntry = () => [policy.title, policy.intro, ...policy.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...s.items])];

test("every text exists in the three languages", () => {
  for (const entry of everyEntry()) {
    for (const text of allTexts(entry)) assert.ok(typeof text === "string" && text.length > 0, JSON.stringify(entry));
  }
});

test("the three languages use the same placeholders", () => {
  const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const entry of everyEntry()) assert.equal(names(entry.fr), names(entry.en)), assert.equal(names(entry.nl), names(entry.en));
});

test("the policy has its eleven numbered sections in the story's order, and a version", () => {
  assert.match(policy.version, /^\d{4}-\d{2}-\d{2}$/);
  const ids = policy.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["controller", "data", "notheld", "recipients", "transfers", "retention", "storage", "rights", "complaints", "automated", "changes"]);
  assert.match(policyView(policy, info, "en", "n/a").sections[1].heading, /^2\. /);
});

test("no placeholder is left unfilled, in any language", () => {
  for (const language of ["en", "fr", "nl"]) {
    const view = policyView(policy, info, language, "n/a");
    const all = JSON.stringify(view);
    assert.doesNotMatch(all, /\{\w+\}/, language);
    assert.ok(all.includes("Acme") && all.includes("Hostco") && all.includes("14"), language);
  }
});

test("retention numbers come from the policy's own figures", () => {
  const text = policyView(policy, info, "en", "n/a").sections.find((s) => s.id === "retention").items.join(" ");
  assert.ok(text.includes(`${policy.retention.securityEventDays} days`));
  assert.ok(text.includes(`${policy.retention.accountYears} years`));
});

test("an unset operator value reads as not configured", () => {
  const view = policyView(policy, {}, "fr", "non configuré");
  assert.match(view.sections[0].paragraphs[0], /Responsable du traitement : non configuré/);
});

test("the passkey-only policy keeps no email, no clear IP address and no second sign-in", () => {
  const english = JSON.stringify(policyView(policy, info, "en", "n/a")).toLowerCase();
  assert.match(english, /does not write your ip address/);
  assert.match(english, /no email address, no password/);
  assert.doesNotMatch(english, /last two sign-ins/);
});

test("fillPolicy leaves an unknown placeholder visible", () => {
  assert.equal(fillPolicy("a {b} {c}", { b: 1 }), "a 1 {c}");
});

test("renderPolicy writes text nodes only", () => {
  const made = [];
  const doc = { createElement: (tag) => { const e = { tag, children: [], append(...c) { this.children.push(...c); } }; made.push(e); return e; } };
  const target = { textContent: "x", children: [], append(...c) { this.children.push(...c); } };
  renderPolicy({ intro: "<b>hi</b>", sections: [{ id: "a", heading: "H", paragraphs: ["P"], items: ["I"] }] }, target, doc);
  assert.equal(target.textContent, "");
  assert.equal(target.children[0].textContent, "<b>hi</b>");
  assert.equal(target.children[1].id, "privacy-a");
  assert.equal(made.filter((e) => e.tag === "li").length, 1);
});
