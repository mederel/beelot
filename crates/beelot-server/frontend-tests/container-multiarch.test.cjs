const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
// The text of a page of the site's reference (pages/docs/): the tags are gone and the entities are decoded.
const docText = (name) => decodeEntities(fs.readFileSync(path.join(root, "pages/docs", name), "utf8").replace(/<[^>]+>/g, ""));
const workflow = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
const job = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > -1, `${name} is a job`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z0-9-]+:\n/);
  return workflow.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("each architecture's leg pushes only its own tag, after trying the image", () => {
  const container = job("container");
  assert.match(container, /\{ arch: amd64, os: ubuntu-26\.04 \}/);
  assert.match(container, /\{ arch: arm64, os: ubuntu-26\.04-arm \}/);
  assert.match(container, /IMAGE: ghcr\.io\/mederel\/beelot:\$\{\{ inputs\.version \}\}-\$\{\{ matrix\.arch \}\}/);
  assert.match(container, /docker push "\$IMAGE"/);
  assert.ok(!/beelot:latest/.test(container), "latest is the manifest's");
  assert.ok(container.indexOf("test-container.sh") < container.indexOf("docker push"), "tried before it is pushed");
  assert.match(container, /packages: write/);
  assert.match(container, /needs: publish/, "after the packages are attached");
});

test("the manifest joins the images under the version and latest, with arm64 only if it was pushed", () => {
  const manifest = job("container-manifest");
  assert.match(manifest, /needs: container/);
  assert.match(manifest, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(manifest, /the amd64 image was not pushed/);
  assert.match(manifest, /imagetools create -t "ghcr\.io\/mederel\/beelot:\$VERSION" -t ghcr\.io\/mederel\/beelot:latest/);
});

test("the install guide says both architectures are published", () => {
  assert.match(docText("install.html"), /for amd64 and arm64 \(one multi-architecture/);
});
