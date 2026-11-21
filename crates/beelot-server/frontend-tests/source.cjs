// The text of the named scripts, for the tests that check how the page's code is wired (a DOM listener, a request, an
// order of calls) where the module cannot be imported without a page. Each test names the modules it reads.
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../static");

function source(...names) {
  return names.map((name) => fs.readFileSync(path.join(staticDir, name), "utf8")).join("\n");
}

module.exports = { source };
