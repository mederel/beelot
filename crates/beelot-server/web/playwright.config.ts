// The browser checks (e2e/): the page, served by a running Beelot server, in Chromium on the sizes of e2e/devices.ts (phones,
// tablets, landscape, desktops). The server is started by the caller (CI does; locally: docker compose up -d --wait && cargo run -p beelot-server);
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
    // The long solo round runs on a few sizes only (US-202): it takes minutes.
    testIgnore: device.longRound ? undefined : /solo-round\.spec/
  }))
});
