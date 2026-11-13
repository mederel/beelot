const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(path.join(__dirname, "../../../.github/workflows/build.yml"), "utf8");
const job = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > -1, `${name} is a job`);
  const next = workflow.slice(start + 1).search(/\n  [a-z-]+:\n/);
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
