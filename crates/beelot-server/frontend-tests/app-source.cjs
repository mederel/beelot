// The app's plain scripts (US-125) in the order index.html loads them, as one text for the wiring tests.
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../static");

function appModules() {
  const html = fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
  return [...html.matchAll(/<script src="\/(app(?:-[a-z-]+)?\.js)"><\/script>/g)].map((match) => match[1]);
}

function appSource() {
  return appModules().map((name) => fs.readFileSync(path.join(staticDir, name), "utf8")).join("\n");
}

module.exports = { appModules, appSource };
