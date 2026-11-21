const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// US-171: the frontend is ES modules that name what they import. One bad name is a link error that blanks the page,
// so this checks every import of every script against the exports of the script it names.
const staticDir = path.join(__dirname, "../static");
const read = (file) => fs.readFileSync(path.join(staticDir, file), "utf8");
const scripts = fs.readdirSync(staticDir).filter((file) => file.endsWith(".js") && file !== "sw.js");
const html = read("index.html");

function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((name) => names.add(name));
  }
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm)) names.add(match[1]);
  return names;
}

function importsOf(source) {
  return [...source.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";/gm)].map((match) => ({
    names: match[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean),
    from: match[2],
  }));
}

test("every named import is an export of the script it comes from", () => {
  for (const file of scripts) {
    for (const { names, from } of importsOf(read(file))) {
      assert.match(from, /^\.\/[\w.-]+\.js$/, `${file} imports ${from}`);
      assert.ok(scripts.includes(from.slice(2)), `${file}: ${from} does not exist`);
      const available = exportsOf(read(from.slice(2)));
      for (const name of names) assert.ok(available.has(name), `${file} imports ${name}, which ${from} does not export`);
    }
  }
});

test("no script is left as a classic script or reads another through a global", () => {
  for (const file of scripts.filter((script) => script !== "telemetry.js")) {
    assert.ok(html.includes(`<script type="module" src="/${file}"></script>`), `${file} is a module tag in index.html`);
  }
  assert.doesNotMatch(html, /<script(?![^>]*type="module")[^>]*src=/);
  for (const file of scripts) {
    const source = read(file);
    assert.doesNotMatch(source, /module\.exports|\brequire\(/, file);
    assert.doesNotMatch(source, /beelotLocales/, file);
  }
  assert.ok(!fs.existsSync(path.join(staticDir, "globals-bridge.js")));
});

test("a script does not import itself and the imports are not duplicated by name", () => {
  for (const file of scripts) {
    const seen = new Set();
    for (const { names, from } of importsOf(read(file))) {
      assert.notEqual(from, `./${file}`);
      for (const name of names) {
        assert.ok(!seen.has(name), `${file} imports ${name} twice`);
        seen.add(name);
      }
    }
  }
});
