const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const svg = fs.readFileSync(path.join(__dirname, "../static/avatars.svg"), "utf8");
const symbols = [...svg.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)].map((m) => ({
  attrs: m[1],
  body: m[2],
  id: /\bid="([^"]+)"/.exec(m[1])?.[1],
}));

const CHARACTERS = ["avatar-camille", "avatar-hugo", "avatar-luc", "avatar-manon"];
const FACES = ["face-annoyed", "face-celebrating", "face-neutral", "face-pleased", "face-thinking"];

test("is one hidden svg sprite", () => {
  assert.match(svg.trim(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" style="display:none">[\s\S]*<\/svg>$/);
  assert.equal(svg.match(/<symbol\b/g).length, svg.match(/<\/symbol>/g).length);
});

test("parses: no element repeats an attribute (browsers drop such a sprite)", () => {
  for (const [tag] of svg.matchAll(/<[a-z][^>]*>/g)) {
    const names = [...tag.matchAll(/\s([\w:-]+)="/g)].map((m) => m[1]);
    assert.equal(new Set(names).size, names.length, tag);
  }
});

test("has exactly the four characters and the five faces", () => {
  assert.deepEqual(symbols.map((s) => s.id).sort(), [...CHARACTERS, ...FACES].sort());
});

test("every symbol uses the same 64 by 64 viewBox", () => {
  for (const s of symbols) assert.match(s.attrs, /viewBox="0 0 64 64"/, s.id);
});

test("has no text, images, ids inside symbols or external references", () => {
  assert.doesNotMatch(svg, /<text|<image|<script|<use|href=|url\(/);
  for (const s of symbols) assert.doesNotMatch(s.body, /\bid=/, s.id);
});

test("the characters differ and the faces differ", () => {
  const bodies = (ids) => new Set(symbols.filter((s) => ids.includes(s.id)).map((s) => s.body.trim()));
  assert.equal(bodies(CHARACTERS).size, 4);
  assert.equal(bodies(FACES).size, 5);
});

test("each character has its own main colour", () => {
  const main = (s) => /<circle cx="32" cy="32" r="30" fill="(#[0-9a-f]{6})"/.exec(s.body)?.[1];
  const colours = symbols.filter((s) => CHARACTERS.includes(s.id)).map(main);
  assert.ok(colours.every(Boolean), "each character starts with its coloured disc");
  assert.equal(new Set(colours).size, 4);
});
