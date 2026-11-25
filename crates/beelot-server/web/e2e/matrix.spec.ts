// The matrix of sizes itself (US-202): the list in devices.ts is what the story asks for, every entry has its reason, and each
// project runs the browser the size and the profile of its entry. It needs no server.
import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures";
import { DEVICES, engineOf } from "./devices";

// The sizes of the story are Chromium's, one entry each; the engine entries (US-203) repeat some of them in another engine.
const CHROMIUM = DEVICES.filter((d) => !d.engine);

const REQUIRED: [number, number][] = [
  [320, 568],
  [375, 667],
  [412, 915],
  [915, 412],
  [1280, 800], // the five of before
  [360, 640],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [667, 375],
  [844, 390],
  [1920, 1080],
  [2560, 1440]
];

test("the list holds every size of the story, each once, with its reason", () => {
  for (const [width, height] of REQUIRED) {
    expect(
      CHROMIUM.filter((d) => d.width === width && d.height === height),
      `${width}×${height}`
    ).toHaveLength(1);
  }
  expect(new Set(DEVICES.map((d) => d.name)).size, "names are unique").toBe(DEVICES.length);
  for (const device of DEVICES) expect(device.reason.length, `${device.name} has a reason`).toBeGreaterThan(10);
  // The shortest screens are the landscape phones.
  expect(Math.min(...DEVICES.map((d) => d.height))).toBe(375);
});

test("the engine entries are the six of the story, each running a smaller set of specs", () => {
  const engines = DEVICES.filter((d) => d.engine);
  expect(engines.map((d) => d.name).sort()).toEqual([
    "desktop-firefox",
    "iphone-390-webkit",
    "narrow-320-firefox",
    "phone-landscape-667-webkit",
    "phone-landscape-844-webkit",
    "tablet-768-webkit"
  ]);
  for (const device of engines) expect(device.only, `${device.name} runs a chosen set of specs`).toBeDefined();
  expect(
    engines.filter((d) => d.only!.test("e2e/solo-round.spec.ts")).map((d) => d.name),
    "one solo round, on WebKit"
  ).toEqual(["iphone-390-webkit"]);
  expect(engines.some((d) => d.only!.test("e2e/sweep.spec.ts"))).toBe(false);
});

test("the long solo round runs on a small phone, a landscape phone, a tablet and a desktop only", () => {
  const long = DEVICES.filter((d) => d.longRound);
  expect(long.map((d) => d.name).sort()).toEqual(["desktop", "narrow-320", "phone-landscape-667", "tablet-768"]);
});

test("the accessibility checks run on a phone, a landscape phone, a tablet and a desktop, in Chromium", () => {
  const sizes = DEVICES.filter((d) => d.accessibility);
  expect(sizes.map((d) => d.name).sort()).toEqual(["desktop", "phone-375", "phone-landscape-844", "tablet-768"]);
  for (const device of sizes) expect(engineOf(device), `${device.name} runs axe in Chromium`).toBe("chromium");
});

test("each project runs its device: size, touch and profile", async ({ page, browserName }, info) => {
  const device = DEVICES.find((d) => d.name === info.project.name);
  expect(device, `${info.project.name} is in devices.ts`).toBeDefined();
  expect(browserName, `${device!.name} runs in its engine`).toBe(device!.engine ?? "chromium");
  expect(page.viewportSize()).toEqual({ width: device!.width, height: device!.height });
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><p>size</p>');
  const seen = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    ratio: devicePixelRatio,
    coarse: matchMedia("(pointer: coarse)").matches,
    agent: navigator.userAgent
  }));
  expect({ width: seen.width, height: seen.height }, "the page is laid out at the size of the device").toEqual({ width: device!.width, height: device!.height });
  if (device!.descriptor || device!.profile) {
    expect(seen.coarse, `${device!.name} is a touch screen`).toBe(true);
    expect(seen.ratio, `${device!.name} has a phone's pixel ratio`).toBeGreaterThan(1.5);
    if (device!.profile) expect(seen.agent).toBe(device!.profile.userAgent);
    else expect(seen.agent, "the descriptor's user agent").toMatch(/iPhone|iPad/);
  } else {
    expect(seen.coarse, "a desktop has a mouse").toBe(false);
  }
});

test("the projects of the config are the devices of the list, none missing", async ({ browserName: _engine }, info) => {
  // One run of `playwright test --list` is enough: the other projects would each start Playwright for the same answer.
  test.skip(info.project.name !== "desktop", "one project reads the list of the projects");
  // Without BEELOT_ENGINE, which a CI shard sets: the whole config, every engine.
  const reported = projectsListed(undefined);
  const listed = DEVICES.map((d) => d.name);
  expect(
    {
      missingFromTheReports: listed.filter((name) => !reported.includes(name)),
      notInTheList: reported.filter((name) => !listed.includes(name))
    },
    "every device is a project, and every project a device"
  ).toEqual({ missingFromTheReports: [], notInTheList: [] });
  expect(reported).toHaveLength(listed.length);
});

test("BEELOT_ENGINE keeps the projects of one engine, so that a CI shard installs and runs that engine only", ({ browserName: _engine }, info) => {
  test.skip(info.project.name !== "desktop", "one project reads the list of the projects");
  for (const engine of ["chromium", "webkit", "firefox"] as const) {
    expect(projectsListed(engine), engine).toEqual(DEVICES.filter((d) => engineOf(d) === engine).map((d) => d.name));
  }
  expect(() => projectsListed("safari"), "an engine Playwright does not have is refused").toThrow();
});

/** The names of the projects `playwright test --list` reports, with BEELOT_ENGINE set to `engine` (or unset). */
function projectsListed(engine: string | undefined): string[] {
  const { BEELOT_ENGINE: _shard, ...env } = process.env;
  const output = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: engine === undefined ? env : { ...env, BEELOT_ENGINE: engine },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const report = JSON.parse(output.slice(output.indexOf("{"))) as { config: { projects: { name: string }[] } };
  return report.config.projects.map((p) => p.name);
}
