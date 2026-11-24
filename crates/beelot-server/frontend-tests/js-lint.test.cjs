const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const web = "crates/beelot-server/web";

test("Biome is configured for the frontend's sources and for these tests", () => {
  const config = JSON.parse(read("crates/beelot-server/biome.json"));
  assert.ok(config.files.includes.includes("web/src/**"));
  assert.ok(config.files.includes.includes("frontend-tests/**"));
  assert.equal(config.linter.enabled, true);
  assert.equal(config.assist.enabled, false, "imports are not reordered");
  const pkg = JSON.parse(read(`${web}/package.json`));
  assert.equal(pkg.scripts.lint, "biome check ..");
  assert.match(pkg.devDependencies["@biomejs/biome"], /^\d+\.\d+\.\d+$/, "the version is pinned");
});

test("the web job runs the lint and the format check", () => {
  const workflow = read(".github/workflows/ci.yml");
  const job = workflow.slice(workflow.indexOf("\n  web:\n"));
  const step = job.slice(job.indexOf("Check, test and build the frontend"));
  assert.ok(job.indexOf("uses: ./.github/actions/setup-web") < job.indexOf("npm run lint"), "after the install");
  assert.match(read(".github/actions/setup-web/action.yml"), /npm ci/);
  assert.ok(step.indexOf("npm run lint") < step.indexOf("npm run build"), "before the build");
});

test("the command to run locally is in AGENTS.md, the README and the develop page", () => {
  for (const file of ["AGENTS.md", "README.md", "pages/docs/develop.html"]) {
    assert.match(read(file), /npm run lint/, file);
  }
});
