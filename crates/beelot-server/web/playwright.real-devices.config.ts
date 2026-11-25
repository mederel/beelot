// The layout checks of US-201 (pages.spec.ts and key-screens.spec.ts) on the real devices of BrowserStack (US-209). It is run
// by .github/workflows/real-devices.yml through browserstack-node-sdk (real-devices/), which takes the devices from the
// browserstack.yml that real-devices/configure.mjs writes: no size is emulated here, each device has its own screen. The server
// runs on the GitHub runner and the devices reach it through BrowserStack Local, as bs-local.com (Safari on iOS cannot reach
// localhost through the tunnel).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [/pages\.spec\.ts/, /key-screens\.spec\.ts/],
  // A real device is slower than a runner's browser, and its session takes a while to open.
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "real-devices-report" }]],
  use: {
    baseURL: process.env.BEELOT_URL ?? "http://bs-local.com:8080",
    locale: "en-US",
    // The same as playwright.config.ts: page.route() must see every request (e2e/mock.ts).
    serviceWorkers: "block",
    trace: "retain-on-failure"
  }
});
