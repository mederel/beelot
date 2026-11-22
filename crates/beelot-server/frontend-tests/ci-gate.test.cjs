const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(path.join(__dirname, "../../../.github/workflows/build.yml"), "utf8");
const job = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > -1, `${name} is a job`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return workflow.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("the matrix job is not the one the ruleset requires", () => {
  assert.match(job("package-build"), /matrix:/);
  assert.ok(!/matrix:/.test(job("package")), "package is the stable gate, with no matrix");
});

test("the package gate always runs and accepts only success or skipped legs", () => {
  const gate = job("package");
  assert.match(gate, /needs: package-build/);
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(gate, /\[ "\$RESULT" = success \] \|\| \[ "\$RESULT" = skipped \]/);
});

test("a release still needs the packages to have been built", () => {
  assert.match(job("release"), /needs: \[changes, check, package\]/);
  assert.match(job("release"), /needs\.package\.result == 'success'/);
});

test("a new commit stops the previous run of a pull request, and a run on main is never stopped", () => {
  const head = workflow.slice(0, workflow.indexOf("\njobs:"));
  assert.match(head, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  // Outside pull requests each run is its own group, so that none is replaced or stopped in the middle of a release.
  assert.match(head, /format\('\{0\}-\{1\}', github\.workflow, github\.run_id\)/);
});

test("a failed job stops the whole run of a pull request or of the merge queue, never one on main", () => {
  for (const name of ["changes", "check", "browser", "package-build", "arch", "gentoo"]) {
    const text = job(name);
    assert.match(text, /actions: write/, `${name} may cancel the run`);
    assert.match(text, /if: failure\(\) && github\.event_name != 'push'/, `${name} stops the run when it fails`);
    assert.match(text, /actions\/runs\/\$GITHUB_RUN_ID\/cancel/, `${name} cancels this run`);
  }
  assert.ok(!/actions\/runs\/\$GITHUB_RUN_ID\/cancel/.test(job("release")), "a release is never stopped by another job");
});
