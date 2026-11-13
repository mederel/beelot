const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/build.yml"), "utf8");
const job = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > -1, `${name} is a job`);
  const next = workflow.slice(start + 1).search(/\n  [a-z0-9-]+:\n/);
  return workflow.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("the amd64 job pushes only its own tag, and the arm64 job pushes its own", () => {
  assert.match(job("container"), /docker push "ghcr\.io\/mederel\/beelot:\$VERSION-amd64"/);
  assert.ok(!/beelot:latest/.test(job("container")), "latest is the manifest's");
  assert.match(job("release-arm64"), /docker push "ghcr\.io\/mederel\/beelot:\$VERSION-arm64"/);
  assert.match(job("release-arm64"), /test-container\.sh "ghcr\.io\/mederel\/beelot:\$VERSION-arm64"/);
});

test("the arm64 image is built after the packages are attached", () => {
  const arm = job("release-arm64");
  assert.ok(arm.indexOf("gh release upload") < arm.indexOf("Build the container image"));
  assert.match(arm, /packages: write/);
});

test("the manifest joins the images under the version and latest, with arm64 only if it was built", () => {
  const manifest = job("container-manifest");
  assert.match(manifest, /needs: \[release, container, release-arm64\]/);
  assert.match(manifest, /needs\.container\.result == 'success'/);
  assert.match(manifest, /\[ "\$ARM64" = success \]/);
  assert.match(manifest, /imagetools create -t "ghcr\.io\/mederel\/beelot:\$VERSION" -t ghcr\.io\/mederel\/beelot:latest/);
});

test("the README says both architectures are published", () => {
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /for amd64 and arm64 \(one multi-architecture/);
});
