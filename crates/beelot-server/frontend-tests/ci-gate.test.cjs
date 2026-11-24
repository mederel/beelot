// The shape of the CI (.github/workflows/ci.yml and release.yml): one required check that waits for every job, the
// fail-fast cancel on every check and never on a release, a release that rests on every check and on the binaries they
// tested, and main's runs one at a time.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ci = read(".github/workflows/ci.yml");
const release = read(".github/workflows/release.yml");
const jobsOf = (workflow) => [...workflow.slice(workflow.indexOf("\njobs:")).matchAll(/\n {2}([a-z0-9-]+):\n/g)].map((m) => m[1]);
const jobIn = (workflow) => (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > -1, `${name} is a job`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z0-9-]+:\n/);
  return workflow.slice(start, next < 0 ? undefined : start + 1 + next);
};
const job = jobIn(ci);
const releaseJob = jobIn(release);

// The jobs whose failure must stop a pull request's run: every job but the gate, the report and the release.
const CHECKS = ["changes", "lint", "web", "rust-test", "rust-doc", "build", "browser", "package", "stack", "arch", "gentoo", "android"];

test("the old workflows are gone: ci.yml and release.yml replace build.yml and android.yml", () => {
  const files = fs.readdirSync(path.join(root, ".github/workflows")).sort();
  assert.deepEqual(files, ["ci.yml", "pr-title.yml", "release.yml"]);
  assert.deepEqual(jobsOf(ci).sort(), [...CHECKS, "browser-report", "ci", "release"].sort());
});

test("the gate waits for every check, always runs, and fails on a failed or cancelled job only", () => {
  const gate = job("ci");
  assert.match(gate, new RegExp(`needs: \\[${CHECKS.join(", ")}\\]`));
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(gate, /grep -Eq '"\(failure\|cancelled\)"'/);
});

test("a pull request's new commit stops its previous run; main runs one at a time and is never stopped", () => {
  const head = ci.slice(0, ci.indexOf("\njobs:"));
  assert.match(head, /format\('ci-pr-\{0\}', github\.event\.pull_request\.number\) \|\| 'ci-main'/);
  assert.match(head, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.doesNotMatch(ci, /merge_group/, "there is no merge queue");
});

test("every check stops a pull request's run when it fails, and no release job does", () => {
  for (const name of CHECKS) {
    const text = job(name);
    assert.match(text, /actions: write/, `${name} may cancel the run`);
    assert.match(
      text,
      /- if: failure\(\) && github\.event_name != 'push'\n\s+uses: \.\/\.github\/actions\/stop-run\n/,
      `${name} stops a pull request's run when it fails, never main's`
    );
    // The comment lines at the end are the next job's.
    const body = text.replace(/(\n {2}#[^\n]*)+\s*$/, "").trimEnd();
    assert.ok(body.endsWith("uses: ./.github/actions/stop-run"), `${name} stops the run as its last step`);
  }
  assert.doesNotMatch(release, /stop-run|actions\/runs\/\$GITHUB_RUN_ID\/cancel/, "a release is never stopped by another job");
});

test("each job runs when the change needs it", () => {
  const when = (name) => job(name).match(/\n {4}if: (.*)\n/)[1];
  assert.equal(when("lint"), "needs.changes.outputs.code == 'true'");
  assert.equal(when("web"), "needs.changes.outputs.web == 'true'");
  for (const name of ["rust-test", "rust-doc", "browser"]) assert.match(when(name), /outputs\.rust == 'true' \|\| needs\.changes\.outputs\.web == 'true'$/);
  for (const name of ["build", "package", "stack"]) assert.match(when(name), /rust == 'true' \|\| .*web == 'true' \|\| .*pkg == 'true'$/);
  assert.equal(when("gentoo"), "needs.changes.outputs.gentoo == 'true'");
  assert.equal(when("android"), "needs.changes.outputs.android == 'true'");
  assert.match(job("changes"), /\.github\/scripts\/ci-changes\.sh "\$EVENT" < changed\.txt/);
});

test("the server is built once per architecture, and the browser tests, the packages and the stack use that binary", () => {
  assert.match(job("build"), /arch: amd64, os: ubuntu-24\.04 \}/);
  assert.match(job("build"), /arch: arm64, os: ubuntu-24\.04-arm \}/);
  assert.match(job("build"), /BEELOT_VERSION: \$\{\{ needs\.changes\.outputs\.version \|\| '0\.0\.0-ci' \}\}/);
  assert.match(job("build"), /name: server-\$\{\{ matrix\.arch \}\}/);
  for (const name of ["browser", "package", "stack"]) {
    assert.match(job(name), /needs: \[changes, build\]/, name);
    assert.doesNotMatch(job(name), /cargo build/, `${name} compiles nothing`);
  }
  assert.match(job("package"), /build-deb\.sh --prebuilt "\$VERSION"/);
  assert.doesNotMatch(release, /cargo build/, "the release compiles nothing");
});

test("the browser tests run in shards of one engine each, which install that engine only", () => {
  const browser = job("browser");
  const legs = [...browser.matchAll(/\{ engine: (\w+), shard: (\d+), of: (\d+) \}/g)].map((m) => ({ engine: m[1], shard: +m[2], of: +m[3] }));
  for (const engine of ["chromium", "webkit", "firefox"]) {
    const mine = legs.filter((leg) => leg.engine === engine);
    assert.ok(mine.length > 0, `${engine} has a shard`);
    assert.deepEqual(
      mine.map((leg) => leg.shard),
      mine.map((_, i) => i + 1),
      `${engine}'s shards are 1 to ${mine.length}`
    );
    assert.ok(
      mine.every((leg) => leg.of === mine.length),
      `${engine}'s shards each say there are ${mine.length}`
    );
  }
  assert.match(browser, /fail-fast: false/);
  assert.match(browser, /npx playwright install --with-deps "\$ENGINE"/);
  assert.match(browser, /BEELOT_ENGINE: \$\{\{ matrix\.engine \}\}/);
  assert.match(browser, /npx playwright test --shard="\$SHARD"/);
  // The compose database has no health check, so --wait does not wait for it to take connections.
  assert.ok(browser.includes("mariadb-admin ping"), "the job waits for the database");
  // Over TCP: during its first start MariaDB runs a temporary server on the socket only, then restarts.
  assert.match(browser, /mariadb-admin ping -h 127\.0\.0\.1 --protocol=TCP/);
  assert.match(browser, /::error::the database did not start/);
  assert.ok(browser.indexOf("mariadb-admin ping") < browser.indexOf("nohup target/release/beelot-server"), "the server starts once the database answers");
  assert.match(browser, /PLAYWRIGHT_BLOB_OUTPUT_NAME: blob-\$\{\{ matrix\.engine \}\}-\$\{\{ matrix\.shard \}\}\.zip/, "the shards' reports do not overwrite each other");
  assert.match(job("browser-report"), /npx playwright merge-reports --reporter html/);
});

test("the database tests share one MariaDB service, but the cost of saving tables is measured alone", () => {
  for (const name of ["rust-test", "rust-doc"]) {
    assert.match(job(name), /image: mariadb:12\.3/, name);
    assert.match(job(name), /BEELOT_TEST_MARIADB_PORT: "3306"/, name);
  }
  // It counts the statements of the whole server, which the other tests would add to.
  assert.match(job("rust-test"), /cargo llvm-cov nextest --workspace --lcov --output-path lcov\.info -E 'not binary\(table_save_cost\)'/);
  assert.match(job("rust-doc"), /cargo test -p beelot-server --test table_save_cost -- --nocapture/);
  assert.match(job("rust-doc"), /cargo test --workspace --doc/);
});

test("on main the release follows the gate, with the version computed when the run started", () => {
  const caller = job("release");
  assert.match(caller, /needs: \[changes, ci\]/);
  assert.match(caller, /if: github\.event_name == 'push' && needs\.ci\.result == 'success' && needs\.changes\.outputs\.version != ''/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/release\.yml/);
  assert.match(caller, /secrets: inherit/);
  assert.match(job("changes"), /if: github\.event_name == 'push' && steps\.filter\.outputs\.code == 'true'\n\s+run: echo "version=\$\(\.github\/scripts\/next-version\.sh\)"/);
  assert.match(release, /on:\n {2}workflow_call:/);
});

test("the release checks the version is still the next one, then publishes both architectures at once", () => {
  const publish = releaseJob("publish");
  assert.match(publish, /concurrency:\n\s+group: release/);
  assert.match(publish, /next=\$\(\.github\/scripts\/next-version\.sh\)\n\s+if \[ "\$next" != "\$VERSION" \]/);
  assert.match(publish, /pattern: packages-\*/);
  for (const asset of ["linux-x86_64.tar.gz", "_amd64.deb", "_arm64.deb", "x86_64.rpm", "aarch64.rpm"]) {
    assert.ok(publish.includes(asset), `the release has ${asset}`);
  }
  for (const name of ["container", "gentoo-overlay", "android-release", "apt-repo"]) assert.match(releaseJob(name), /needs: publish/, name);
});

test("the Android app is built once with one Java, and only when it changes", () => {
  const android = job("android");
  assert.equal(android.match(/actions\/setup-java@/g).length, 1);
  assert.match(android, /cache: gradle/);
  assert.equal(releaseJob("android-release").match(/actions\/setup-java@/g).length, 1);
});

test("the workflows are linted with actionlint and shellcheck", () => {
  assert.match(job("lint"), /docker run --rm -v "\$PWD":\/repo -w \/repo rhysd\/actionlint:\d+\.\d+\.\d+/);
});

test("every job has a time limit", () => {
  for (const [file, workflow] of [
    ["ci.yml", ci],
    ["release.yml", release]
  ]) {
    for (const name of jobsOf(workflow)) {
      const text = jobIn(workflow)(name);
      // A job that calls a reusable workflow has no runner of its own, so no limit of its own.
      if (/\n {4}uses: /.test(text)) continue;
      assert.match(text, /\n {4}timeout-minutes: \d+/, `${file}: ${name}`);
    }
  }
});
