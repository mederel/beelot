const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { versionView, showVersion } = require("../static/version-label.js");

const html = fs.readFileSync(path.join(__dirname, "../static/index.html"), "utf8");
const RELEASE = "https://github.com/mederel/beelot/releases/tag/v1.12.0";

const fakeDocument = () => ({
  createElement: () => ({ append() {}, className: "" })
});
const fakeTarget = () => ({ textContent: "", hidden: true, children: [], append(child) { this.children.push(child); } });

test("a release is shown as Beelot v<version> with its release page", () => {
  assert.deepEqual(versionView({ version: "1.12.0", releaseUrl: RELEASE }), { text: "Beelot v1.12.0", href: RELEASE });
});

test("a dev build is shown as text with no link", () => {
  assert.deepEqual(versionView({ version: "dev", releaseUrl: null }), { text: "Beelot dev", href: null });
});

test("a link that is not http(s) is never used", () => {
  assert.equal(versionView({ version: "1.0.0", releaseUrl: "javascript:alert(1)" }).href, null);
});

test("nothing is shown without an answer", () => {
  assert.equal(versionView(null), null);
  assert.equal(versionView({}), null);
  const target = fakeTarget();
  showVersion(null, target, fakeDocument(), "Release notes");
  assert.equal(target.hidden, true);
});

test("a release link opens in a new tab without leaking the opener", () => {
  const target = fakeTarget();
  const doc = { createElement: () => ({ append() {} }) };
  showVersion({ version: "1.12.0", releaseUrl: RELEASE }, target, doc, "Release notes");
  const link = target.children[0];
  assert.equal(link.href, RELEASE);
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(link.title, "Release notes");
  assert.equal(link.textContent, "Beelot v1.12.0");
  assert.equal(target.hidden, false);
});

test("a dev build fills the footer with plain text", () => {
  const target = fakeTarget();
  showVersion({ version: "dev", releaseUrl: null }, target, fakeDocument(), "Release notes");
  assert.equal(target.textContent, "Beelot dev");
  assert.equal(target.children.length, 0);
});

test("the footer has a place for it and the script loads before app.js", () => {
  assert.match(html, /<span id="app-version"[^>]*hidden/);
  assert.ok(html.indexOf('src="/version-label.js"') > 0);
  assert.ok(html.indexOf('src="/version-label.js"') < html.indexOf('src="/app.js"'));
});

test("the new text is translated", () => {
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "../static", file), "utf8"), /"Release notes":/);
  }
});
