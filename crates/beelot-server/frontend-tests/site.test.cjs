const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const page = read("pages/index.html");

const decode = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// The apt commands of a README or page block: the lines between the first "sudo install" and "sudo apt install beelot".
function installCommands(text) {
  const start = text.indexOf("sudo install -d");
  const end = text.indexOf("sudo apt install beelot", start) + "sudo apt install beelot".length;
  return decode(text.slice(start, end)).trim();
}

test("the page gives the same install commands as the README", () => {
  const readme = installCommands(read("README.md"));
  assert.ok(readme.includes("sudo apt update"));
  assert.equal(installCommands(page), readme);
});

test("the page loads nothing from another site", () => {
  const sources = [...page.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  // Images, scripts and styles are relative. Only links the visitor follows may be absolute.
  for (const match of page.matchAll(/<(?:img|script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^(?:https?:)?\/\//, match[1]);
  }
  const allowed = [
    /^https:\/\/github\.com\/mederel\/beelot(?:\/releases\/latest|#install-from-the-apt-repository)?$/,
    /^\{\{PLAY_URL\}\}(?:\/|\/rules|\/privacy)$/,
    /^#main$/,
    /^\.\/$/,
    /^images\/[a-z]+\.(?:svg|jpg)$/,
    /^site\.(?:css|js)$/
  ];
  for (const source of sources) {
    assert.ok(allowed.some((pattern) => pattern.test(source)), `unexpected address ${source}`);
  }
});

test("every file the page uses exists", () => {
  for (const file of ["pages/site.css", "pages/site.js", "docs/images/home.jpg", "docs/images/bidding.jpg", "docs/images/logo.svg"]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
});

test("each text is given in English, French and Dutch", () => {
  const visible = page.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  for (const language of ["en", "fr", "nl"]) {
    assert.ok(visible.includes(`lang="${language}"`));
  }
  // Every group of sibling language spans holds the three languages, in order.
  const groups = visible.match(/(?:<span lang="(?:en|fr|nl)">[\s\S]*?<\/span>)+/g);
  assert.ok(groups.length >= 15);
  for (const group of groups) {
    const languages = [...group.matchAll(/<span lang="(en|fr|nl)">/g)].map((match) => match[1]);
    assert.deepEqual(languages, ["en", "fr", "nl"], group.slice(0, 60));
  }
});

test("the game's links carry data-play so a build without a game leaves them out, one per line", () => {
  const lines = page.split("\n").filter((line) => line.includes("{{PLAY_URL}}"));
  assert.equal(lines.length, 3);
  for (const line of lines) assert.match(line, /data-play/);
  assert.equal(page.split("\n").filter((line) => line.includes("data-play")).length, 3);
});

test("the page has its landmarks, a title and a language", () => {
  assert.match(page, /<html lang="en"/);
  assert.match(page, /<title>[^<]+<\/title>/);
  for (const tag of ["header", "main", "footer"]) assert.match(page, new RegExp(`<${tag}[ >]`));
  assert.equal((page.match(/<h1>/g) || []).length, 1);
  assert.equal((page.match(/<img /g) || []).length, 3);
});

test("the version placeholder is filled by the build", () => {
  assert.equal((page.match(/\{\{VERSION\}\}/g) || []).length, 3);
});
