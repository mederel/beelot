const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "../../..");
const script = path.join(root, ".github/scripts/check-no-build-leftovers.sh");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
const run = (repo) => spawnSync("bash", [script, repo], { encoding: "utf8" });

function repoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beelot-hygiene-"));
  git(dir, "init", "-q");
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), "x");
  }
  git(dir, "add", "-f", ".");
  return dir;
}

test("the check passes for a repository with sources only", () => {
  const dir = repoWith(["tools/music/compose.py", "README.md"]);
  assert.equal(run(dir).status, 0);
});

test("the check fails for a tracked __pycache__ or .pyc", () => {
  for (const file of ["tools/music/__pycache__/compose.cpython-314.pyc", "tools/x.pyc", "__pycache__/a.txt"]) {
    const result = run(repoWith([file]));
    assert.equal(result.status, 1, file);
    assert.match(result.stdout, /pycache|\.pyc/);
  }
});

test("the repository itself tracks no Python cache and ignores them and the editor's folder", () => {
  assert.equal(run(root).status, 0);
  const ignored = (p) => spawnSync("git", ["check-ignore", "-q", p], { cwd: root }).status === 0;
  assert.ok(ignored("tools/music/__pycache__/compose.cpython-314.pyc"));
  assert.ok(ignored(".idea/workspace.xml"));
});

test("the check job runs the check", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/build.yml"), "utf8");
  assert.match(workflow, /\.github\/scripts\/check-no-build-leftovers\.sh/);
});
