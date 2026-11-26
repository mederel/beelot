// What a change makes CI run (.github/scripts/ci-changes.sh): the flags the ci workflow's jobs are gated on, from the list of
// the files a pull request or a push changed.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "../../../.github/scripts/ci-changes.sh");

function flags(event, files) {
  const result = spawnSync("bash", [script, event], { input: files.map((f) => `${f}\n`).join(""), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("="))
  );
}

const ALL = { code: "true", rust: "true", web: "true", pkg: "true", android: "true", gentoo: "true", bots: "true" };
const NONE = { code: "false", rust: "false", web: "false", pkg: "false", android: "false", gentoo: "false", bots: "false" };

test("documentation alone runs nothing", () => {
  assert.deepEqual(flags("pull_request", ["docs/adr/001-rust-platform.md", "README.md", "crates/beelot-game/NOTES.md"]), NONE);
});

test("an empty or unknown diff runs everything", () => {
  assert.deepEqual(flags("pull_request", []), ALL);
  assert.deepEqual(flags("push", []), ALL);
});

test("a Rust change runs the Rust jobs, not the frontend's nor Android's", () => {
  assert.deepEqual(flags("pull_request", ["crates/beelot-game/src/lib.rs"]), { ...NONE, code: "true", rust: "true", bots: "true" });
  assert.equal(flags("pull_request", ["Cargo.toml"]).rust, "true");
  assert.equal(flags("pull_request", ["rust-toolchain.toml"]).rust, "true");
  assert.equal(flags("pull_request", ["fixtures/deal-1.json"]).rust, "true");
});

test("the bot benchmark runs for the bots, the arena, the lock and the toolchain, not for the server", () => {
  assert.equal(flags("pull_request", ["crates/beelot-arena/src/arena.rs"]).bots, "true");
  assert.equal(flags("pull_request", ["Cargo.lock"]).bots, "true");
  assert.equal(flags("pull_request", ["rust-toolchain.toml"]).bots, "true");
  assert.equal(flags("pull_request", ["crates/beelot-server/src/main.rs"]).bots, "false");
  assert.equal(flags("pull_request", ["crates/beelot-game/NOTES.md"]).bots, "false", "documentation runs nothing");
});

test("a frontend change is the frontend's, not Rust's", () => {
  assert.deepEqual(flags("pull_request", ["crates/beelot-server/web/src/App.svelte", "crates/beelot-server/static/index.html"]), {
    ...NONE,
    code: "true",
    web: "true"
  });
});

test("the repository script tests and the site are checked by lint alone", () => {
  assert.deepEqual(flags("pull_request", ["crates/beelot-server/frontend-tests/site.test.cjs", "pages/index.html"]), { ...NONE, code: "true" });
});

test("packaging, Android and Gentoo have flags of their own", () => {
  assert.deepEqual(flags("pull_request", ["packaging/debian/postinst"]), { ...NONE, code: "true", pkg: "true" });
  assert.deepEqual(flags("pull_request", [".github/scripts/build-rpm.sh"]), { ...NONE, code: "true", pkg: "true" });
  assert.deepEqual(flags("pull_request", ["android/app/build.gradle.kts"]), { ...NONE, code: "true", android: "true" });
  assert.deepEqual(flags("pull_request", ["packaging/gentoo/beelot.ebuild"]), { ...NONE, code: "true", pkg: "true", gentoo: "true" });
  assert.equal(flags("pull_request", ["Cargo.lock"]).gentoo, "true", "the ebuild lists the crates of the lock");
});

test("the Lighthouse run is the packaging's: it builds and measures, and the frontend's checks do not run", () => {
  assert.deepEqual(flags("pull_request", ["lighthouse/run.mjs"]), { ...NONE, code: "true", pkg: "true" });
});

test("a change to the workflows or their actions runs everything", () => {
  assert.deepEqual(flags("pull_request", [".github/workflows/ci.yml"]), ALL);
  assert.deepEqual(flags("pull_request", [".github/actions/setup-rust/action.yml"]), ALL);
  assert.deepEqual(flags("pull_request", [".node-version"]), ALL);
});

test("on main every job runs when code changed, so that a release rests on every check; Gentoo and the bot benchmark (a pull request's) keep theirs", () => {
  assert.deepEqual(flags("push", ["pages/index.html"]), { ...ALL, gentoo: "false", bots: "false" });
  assert.deepEqual(flags("push", ["docs/plan.md"]), NONE);
});
