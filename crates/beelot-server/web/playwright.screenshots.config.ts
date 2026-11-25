// The screenshots of the key screens (US-205): e2e/screenshots.spec.ts on six sizes, in Chromium, compared with the approved
// images of e2e/screenshots/<project>/. Run it in Playwright's pinned container with .github/scripts/screenshots.sh, which
// is the only place the images are made and compared (fonts and anti-aliasing differ by machine); `--update-snapshots`
// regenerates them. The server is started by the caller, as for the other browser tests; BEELOT_URL says where it listens.
import { defineConfig } from "@playwright/test";
import { DEVICES, SCREENSHOT_SIZES, useOf } from "./e2e/devices";

const sizes = SCREENSHOT_SIZES.map((name) => {
  const device = DEVICES.find((entry) => entry.name === name);
  if (!device) throw new Error(`${name} is not in e2e/devices.ts`);
  return device;
});

export default defineConfig({
  testDir: "./e2e",
  testMatch: /screenshots\.spec\.ts$/,
  timeout: 60_000,
  fullyParallel: true,
  // A screenshot that needs a second try is not stable: no retry.
  retries: 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: "list",
  // The images at a path of their own, by size, so that a size's images are one folder.
  snapshotPathTemplate: "{testDir}/screenshots/{projectName}/{arg}{ext}",
  expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 0 } },
  use: {
    baseURL: process.env.BEELOT_URL ?? "http://localhost:8080",
    locale: "en-US",
    serviceWorkers: "block",
    // One pixel is one pixel: the images are small, and equal on every machine that has the container.
    deviceScaleFactor: 1,
    trace: "off"
  },
  projects: sizes.map((device) => ({ name: `screens-${device.name}`, use: { ...useOf(device), deviceScaleFactor: 1 } }))
});
