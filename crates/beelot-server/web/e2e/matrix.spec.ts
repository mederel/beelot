// The matrix of sizes itself (US-202): the list in devices.ts is what the story asks for, every entry has its reason, and each
// project runs the browser the size and the profile of its entry. It needs no server.
import { expect, test } from "./fixtures";
import { DEVICES } from "./devices";

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
      DEVICES.filter((d) => d.width === width && d.height === height),
      `${width}×${height}`
    ).toHaveLength(1);
  }
  expect(new Set(DEVICES.map((d) => d.name)).size, "names are unique").toBe(DEVICES.length);
  for (const device of DEVICES) expect(device.reason.length, `${device.name} has a reason`).toBeGreaterThan(10);
  // The shortest screens are the landscape phones.
  expect(Math.min(...DEVICES.map((d) => d.height))).toBe(375);
});

test("the long solo round runs on a small phone, a landscape phone, a tablet and a desktop only", () => {
  const long = DEVICES.filter((d) => d.longRound);
  expect(long.map((d) => d.name).sort()).toEqual(["desktop", "narrow-320", "phone-landscape-667", "tablet-768"]);
});

test("each project runs its device: size, touch and profile", async ({ page }, info) => {
  const device = DEVICES.find((d) => d.name === info.project.name);
  expect(device, `${info.project.name} is in devices.ts`).toBeDefined();
  expect(page.viewportSize()).toEqual({ width: device!.width, height: device!.height });
  await page.setContent("<p>size</p>");
  const seen = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    ratio: devicePixelRatio,
    coarse: matchMedia("(pointer: coarse)").matches,
    agent: navigator.userAgent
  }));
  // A mobile profile can lay the page out wider than a viewport narrower than 980 px; the tests' pages set a viewport meta.
  expect(seen.height).toBe(device!.height);
  if (device!.descriptor || device!.profile) {
    expect(seen.coarse, `${device!.name} is a touch screen`).toBe(true);
    expect(seen.ratio, `${device!.name} has a phone's pixel ratio`).toBeGreaterThan(1.5);
    if (device!.profile) expect(seen.agent).toBe(device!.profile.userAgent);
    else expect(seen.agent, "the descriptor's user agent").toMatch(/iPhone|iPad/);
  } else {
    expect(seen.coarse, "a desktop has a mouse").toBe(false);
  }
});
