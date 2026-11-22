// The browser checks (e2e/): the page, served by a running Beelot server, in Chromium on phones, in landscape and on a
// desktop. The server is started by the caller (CI does; locally: docker compose up -d --wait && cargo run -p beelot-server);
// BEELOT_URL says where it listens.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BEELOT_URL ?? "http://localhost:8080",
    locale: "en-US",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "phone-375", use: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: "narrow-320", use: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } },
    {
      name: "android-portrait",
      use: { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36" }
    },
    {
      name: "android-landscape",
      use: { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36" }
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } }
  ]
});
