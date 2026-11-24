// The browser checks (e2e/): the page, served by a running Beelot server, in Chromium on the sizes of e2e/devices.ts (phones,
// tablets, landscape, desktops), and in WebKit and Firefox on the key screens. The server is started by the caller (CI does; locally: docker compose up -d --wait && cargo run -p beelot-server);
// BEELOT_URL says where it listens. BEELOT_ENGINE (chromium, webkit or firefox) keeps the projects of one engine: CI runs each
// engine in shards of its own (--shard), which install that engine only.
import { defineConfig } from "@playwright/test";
import { DEVICES, ENGINES, type Engine, engineOf, useOf } from "./e2e/devices";

const engine = process.env.BEELOT_ENGINE || undefined;
if (engine !== undefined && !ENGINES.includes(engine as Engine)) {
  throw new Error(`BEELOT_ENGINE is ${engine}: it must be one of ${ENGINES.join(", ")}`);
}
const devices = engine === undefined ? DEVICES : DEVICES.filter((device) => engineOf(device) === engine);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // The server and its database run on the same 4-vCPU runner as the browsers.
  workers: process.env.CI ? 3 : undefined,
  // On CI each shard writes a blob report; the browser-report job merges them into one HTML report.
  reporter: process.env.CI ? [["list"], ["blob"]] : "list",
  use: {
    baseURL: process.env.BEELOT_URL ?? "http://localhost:8080",
    locale: "en-US",
    trace: "retain-on-failure"
  },
  projects: devices.map((device) => ({
    name: device.name,
    use: useOf(device),
    // The engines run the specs their entry names (US-203). The long solo round runs on a few Chromium sizes only (US-202): it takes minutes.
    testMatch: device.only,
    testIgnore: device.longRound || device.only ? undefined : /solo-round\.spec/
  }))
});
