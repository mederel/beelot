// The Debian package script (.github/scripts/build-deb.sh) builds the server, or packs the one CI's build job made
// (--prebuilt). Run in a scratch directory with `cargo` and `dpkg` stubbed: the stubs record what they were asked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "../../../.github/scripts/build-deb.sh");

function run(args, { binary }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-deb-"));
  const bin = path.join(dir, "stubs");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "cargo"), '#!/bin/sh\necho "cargo $*" >> "$CALLS"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "dpkg"), "#!/bin/sh\necho amd64\n", { mode: 0o755 });
  if (binary) {
    fs.mkdirSync(path.join(dir, "target/release"), { recursive: true });
    fs.writeFileSync(path.join(dir, "target/release/beelot-server"), "", { mode: 0o755 });
  }
  const calls = path.join(dir, "calls");
  const result = spawnSync("bash", [script, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls }
  });
  const made = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, calls: made };
}

test("without --prebuilt the script builds the release server, then packs it", () => {
  const { status, calls } = run(["1.2.3"], { binary: false });
  assert.equal(status, 0);
  assert.match(calls, /^cargo build --release --locked -p beelot-server$/m);
  assert.match(calls, /^cargo deb -p beelot-server --no-build --deb-version 1\.2\.3 /m);
});

test("with --prebuilt it packs the binary already built, and builds nothing", () => {
  const { status, calls } = run(["--prebuilt", "1.2.3"], { binary: true });
  assert.equal(status, 0);
  assert.doesNotMatch(calls, /cargo build/);
  assert.match(calls, /^cargo deb -p beelot-server --no-build --deb-version 1\.2\.3 /m);
});

test("with --prebuilt and no binary it stops and says so", () => {
  const { status, stderr, calls } = run(["--prebuilt", "1.2.3"], { binary: false });
  assert.notEqual(status, 0);
  assert.match(stderr, /build the release server first/);
  assert.equal(calls, "");
});
