// The browser checks (e2e/): the page, served by a running Beelot server, in Chromium on the sizes of e2e/devices.ts (phones,
// tablets, landscape, desktops), and in WebKit and Firefox on the key screens. The server is started by the caller (CI does; locally: docker compose up -d --wait && cargo run -p beelot-server);
// BEELOT_URL says where it listens.
import { defineConfig } from "@playwright/test";
import { DEVICES, useOf } from "./e2e/devices";

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
  projects: DEVICES.map((device) => ({
    name: device.name,
    use: useOf(device),
    // The engines run the specs their entry names (US-203). The long solo round runs on a few Chromium sizes only (US-202): it takes minutes.
    testMatch: device.only,
    testIgnore: device.longRound || device.only ? undefined : /solo-round\.spec/
  }))
});
