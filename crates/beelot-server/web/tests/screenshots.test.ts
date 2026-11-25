// US-205: the approved screenshots of the key screens (e2e/screenshots). The images are made in Playwright's pinned container, so
// the version it takes from package.json must be exact; every size must hold every image; and together they stay light.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { SCREENSHOT_SIZES } from "../e2e/devices";
import { IMAGES, SCREENS, TRANSLATED } from "../e2e/screenshot-list";

const WEB = join(__dirname, "..");
const IMAGES_DIR = join(WEB, "e2e/screenshots");
const SCRIPT = join(WEB, "../../../.github/scripts/screenshots.sh");

test("the story's screens and sizes: eight screens on six sizes, and one screen in French and one in Dutch", () => {
  assert.deepEqual([...SCREENS], ["home", "setup", "auction", "mid-trick", "round-result", "match-end", "lobby", "settings"]);
  assert.equal(Object.keys(TRANSLATED).length, 2);
  assert.equal(SCREENSHOT_SIZES.length, 6);
  assert.equal(IMAGES.length, 10);
});

test("Playwright is pinned to an exact version, and the container's image is taken from it", () => {
  const { devDependencies } = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8"));
  assert.match(devDependencies["@playwright/test"], /^\d+\.\d+\.\d+$/);
  const script = readFileSync(SCRIPT, "utf8");
  assert.match(script, /image=mcr\.microsoft\.com\/playwright:v\$version-noble/);
  assert.match(script, /devDependencies\['@playwright\/test'\]/);
  // The flag is only ever the caller's: the script passes its arguments through and adds none.
  assert.doesNotMatch(script.replace(/^#.*$/gm, ""), /--update-snapshots/, "the script never updates the images by itself");
});

test("every size holds every image, and no other", () => {
  for (const size of SCREENSHOT_SIZES) {
    const dir = join(IMAGES_DIR, `screens-${size}`);
    assert.ok(existsSync(dir), `${size} has a folder of images`);
    assert.deepEqual(readdirSync(dir).sort(), IMAGES.map((image) => `${image}.png`).sort(), size);
  }
  assert.deepEqual(readdirSync(IMAGES_DIR).sort(), SCREENSHOT_SIZES.map((size) => `screens-${size}`).sort(), "no folder of a size that is gone");
});

test("the approved images weigh under 20 MB together", () => {
  let bytes = 0;
  for (const dir of readdirSync(IMAGES_DIR)) for (const file of readdirSync(join(IMAGES_DIR, dir))) bytes += statSync(join(IMAGES_DIR, dir, file)).size;
  assert.ok(bytes < 20 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(1)} MB of images`);
});
