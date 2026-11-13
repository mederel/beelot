const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workflow = read(".github/workflows/build.yml");
const job = workflow.slice(workflow.indexOf("  gentoo-overlay:"), workflow.indexOf("  # Builds the Android release bundle"));

test("the overlay job runs after a release on main, in a stage3 container, and uploads the tarball", () => {
  assert.match(job, /needs: release/);
  assert.match(job, /github\.ref == 'refs\/heads\/main' && needs\.release\.outputs\.version != ''/);
  assert.match(job, /gentoo\/stage3:latest \.github\/scripts\/build-gentoo-overlay\.sh "\$VERSION" dist/);
  assert.match(job, /gh release upload "v\$VERSION" "dist\/beelot-gentoo-overlay-\$VERSION\.tar\.gz"/);
  assert.match(job, /contents: write/);
});

test("the build script names the asset like the job and README do, and checks what it made", () => {
  const script = read(".github/scripts/build-gentoo-overlay.sh");
  assert.match(script, /beelot-gentoo-overlay-\$version\.tar\.gz/);
  assert.match(script, /grep -q "\^DIST beelot-\$version\.tar\.gz "/);
  assert.match(script, /unfilled placeholder/);
  assert.ok(!/prepare-ebuild\.sh"[^\n]*\.tar\.gz/.test(script), "the Manifest comes from the tag's tarball, not a local one");
});

test("the README installs from the asset and still says how to generate the overlay", () => {
  const readme = read("README.md");
  assert.match(readme, /beelot-gentoo-overlay-<version>\.tar\.gz/);
  assert.match(readme, /releases\/download\/v<version>\/beelot-gentoo-overlay-<version>\.tar\.gz/);
  assert.match(readme, /prepare-ebuild\.sh <version> \/var\/db\/repos\/beelot/);
});
