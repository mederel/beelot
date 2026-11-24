// The composite actions the CI's jobs share (.github/actions): the Rust toolchain and its cache, the frontend's Node and
// packages, and the fail-fast cancel of a pull request's run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const action = (name) => read(`.github/actions/${name}/action.yml`);

test("the Rust setup installs the pinned toolchain and saves its cache on main only", () => {
  const rust = action("setup-rust");
  assert.match(rust, /using: composite/);
  assert.match(rust, /rustup toolchain install --profile minimal/);
  assert.match(rust, /v\[2\] < 28/, "rustup reads rust-toolchain.toml from 1.28 on");
  assert.match(rust, /shared-key: \$\{\{ inputs\.cache-key \}\}/);
  assert.match(rust, /save-if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}/, "pull requests restore main's cache, never save their own");
});

test("the frontend setup takes Node from .node-version, caches npm and installs the locked packages", () => {
  const web = action("setup-web");
  assert.match(web, /node-version-file: \.node-version/);
  assert.match(web, /cache: npm/);
  assert.match(web, /cache-dependency-path: crates\/beelot-server\/web\/package-lock\.json/);
  assert.match(web, /npm ci/);
});

test(".node-version satisfies the frontend's engines field", () => {
  const pinned = Number.parseInt(read(".node-version").trim(), 10);
  const wanted = JSON.parse(read("crates/beelot-server/web/package.json")).engines.node;
  const major = Number.parseInt(wanted.replace(">=", ""), 10);
  // A bare major (22) resolves to its latest release, which is past any minor the engines field asks of it.
  assert.ok(pinned >= major, `${pinned} satisfies ${wanted}`);
});

test("the fail-fast cancel cancels the run, and leaves when to the job", () => {
  const stop = action("stop-run");
  // A step that uses an action runs only while the job succeeds, unless it says otherwise, and failure() inside a composite
  // action sees the action's own steps only: the condition is the calling step's (ci-gate.test.cjs checks it).
  assert.doesNotMatch(stop, /\n\s+if:/);
  assert.match(stop, /actions\/runs\/\$GITHUB_RUN_ID\/cancel/);
  assert.match(stop, /\|\| true/, "a fork's read-only token cannot cancel: that is not a failure");
});

test("every third-party action is pinned to a full commit", () => {
  for (const dir of fs.readdirSync(path.join(root, ".github/actions"))) {
    for (const line of action(dir)
      .split("\n")
      .filter((l) => /uses: [^.]/.test(l))) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d/, line.trim());
    }
  }
});
