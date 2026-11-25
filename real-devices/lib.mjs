// The real devices of BrowserStack that the layout checks run on before a release (US-209), the SDK's configuration and the
// record of a run. The names are those of BrowserStack's list of devices for Playwright: when one is retired, change it here.
export const DEVICES = [
  { deviceName: "iPhone 15", os: "ios", osVersion: "17", browserName: "safari", why: "Safari on a phone with a notch: the safe areas and Safari's own bars" },
  { deviceName: "Samsung Galaxy S22 Ultra", os: "android", osVersion: "12.0", browserName: "chrome", why: "Chrome on Samsung's Android, a tall screen and Samsung's fonts" },
  { deviceName: "Google Pixel 7 Pro", os: "android", osVersion: "13.0", browserName: "chrome", why: "Chrome on Google's own Android" }
];

const quote = (value) => JSON.stringify(String(value));

// browserstack.yml for browserstack-node-sdk. The credentials are not in it: the SDK reads BROWSERSTACK_USERNAME and
// BROWSERSTACK_ACCESS_KEY from the environment.
export function browserstackConfig({ build }) {
  const platforms = DEVICES.map(
    ({ deviceName, osVersion, browserName }) =>
      `  - deviceName: ${quote(deviceName)}\n    osVersion: ${quote(osVersion)}\n    browserName: ${quote(browserName)}\n    deviceOrientation: portrait`
  );
  return [
    "# Written by real-devices/configure.mjs from lib.mjs: change the devices there.",
    "framework: playwright",
    'projectName: "Beelot"',
    `buildName: ${quote(build)}`,
    "platforms:",
    ...platforms,
    "parallelsPerPlatform: 1",
    // The server runs on the GitHub runner; the devices reach it through the tunnel, as bs-local.com.
    "browserstackLocal: true",
    "debug: false",
    "networkLogs: false",
    "consoleLogs: errors",
    ""
  ].join("\n");
}

const OUTCOMES = { success: "passed", failure: "failed", cancelled: "cancelled" };

// The record of a run, in Markdown: the job's summary, the comment on the pull request, the section of the release notes.
export function report({ outcome, date, version, commit, runUrl }) {
  const result = OUTCOMES[outcome];
  if (result === undefined) throw new Error(`unknown outcome ${outcome}: expected ${Object.keys(OUTCOMES).join(", ")}`);
  return [
    "### Real devices (US-209)",
    "",
    `- Date: ${date}`,
    `- Version: ${version} (commit ${String(commit).slice(0, 7)})`,
    `- Layout checks on BrowserStack: **${result}** ([run](${runUrl}))`,
    "",
    "| Device | System | Browser |",
    "| --- | --- | --- |",
    ...DEVICES.map((d) => `| ${d.deviceName} | ${d.os === "ios" ? "iOS" : "Android"} ${d.osVersion} | ${d.browserName === "safari" ? "Safari" : "Chrome"} |`),
    "",
    "Found on the checklist (docs/real-devices.md): _to be filled in by the person who tried the devices._",
    ""
  ].join("\n");
}
