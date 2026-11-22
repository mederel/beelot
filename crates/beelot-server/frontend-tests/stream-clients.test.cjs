const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

// The source files of the clients in the repository: the web app and the Android app (the build output is generated).
const clientFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return ["build", "node_modules", ".gradle"].includes(entry.name) ? [] : clientFiles(file);
        return /\.(ts|js|svelte|kt|java|xml)$/.test(entry.name) ? [file] : [];
      })
    : [];

const streamUrls = () =>
  [path.join(root, "crates/beelot-server/web/src"), path.join(root, "android")].flatMap(clientFiles).flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /\/events\b/.test(line) && /api\/tables/.test(line))
      .map((line) => ({ file: path.relative(root, file), line: line.trim() }))
  );

test("every client opens the table stream with a ticket and events=1, and never with the player token in the URL (US-179)", () => {
  const urls = streamUrls();
  assert.ok(urls.length > 0, "the web app opens the stream somewhere");
  for (const { file, line } of urls) {
    assert.ok(line.includes("events=1"), `${file} opens the stream without events=1: ${line}`);
    assert.ok(line.includes("ticket="), `${file} opens the stream without a ticket: ${line}`);
    assert.ok(!/[?&]token=/.test(line), `${file} puts the player token in the URL: ${line}`);
  }
});
