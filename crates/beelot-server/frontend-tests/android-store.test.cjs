const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "../../..");
const listing = (locale, file) => fs.readFileSync(path.join(root, "android/store", locale, file), "utf8").trimEnd();
const locales = ["en-US", "fr-FR", "nl-NL"];

test("the Play listing exists in English, French and Dutch, within Play's limits", () => {
  for (const locale of locales) {
    assert.ok([...listing(locale, "title.txt")].length <= 30, `${locale} title`);
    assert.ok([...listing(locale, "short_description.txt")].length <= 80, `${locale} short description`);
    const full = listing(locale, "full_description.txt");
    assert.ok(full.length > 200 && [...full].length <= 4000, `${locale} full description`);
    assert.ok(full.includes("beelot.fr/privacy"), `${locale} links the privacy policy`);
  }
});

test("the listing promises nothing the policy does not: no email, no ads, no trackers", () => {
  for (const locale of locales) {
    const text = listing(locale, "full_description.txt").toLowerCase();
    assert.doesNotMatch(text, /sign in with (google|facebook)|in-app purchase|achat intégré/);
  }
});

const versionCode = (version) => spawnSync(path.join(root, ".github/scripts/android-version.sh"), [version], { encoding: "utf8" });

test("the versionCode grows with the release version", () => {
  assert.equal(versionCode("1.12.3").stdout.trim(), "1012003");
  assert.equal(versionCode("0.0.1").stdout.trim(), "1");
  const codes = ["0.9.9", "0.10.0", "1.0.0", "1.0.1", "1.1.0", "2.0.0"].map((v) => Number(versionCode(v).stdout));
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
  assert.equal(new Set(codes).size, codes.length);
});

test("a version that is not major.minor.patch, or too large, is refused", () => {
  for (const bad of ["1.2", "v1.2.3", "1.2.3-ci", "1.1000.0", "1.0.1000"]) assert.notEqual(versionCode(bad).status, 0, bad);
});

test("the release build is signed only from the environment, never from the repository", () => {
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle.kts"), "utf8");
  assert.match(gradle, /environmentVariable\("BEELOT_UPLOAD_KEYSTORE"\)/);
  assert.doesNotMatch(gradle, /storePassword = "/);
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  assert.doesNotMatch(tracked, /\.(jks|keystore|p12|pem)$/m);
});
