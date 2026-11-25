// The pieces of the real-device run that need no device and no BrowserStack account (US-209).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { browserstackConfig, DEVICES, report } from "../lib.mjs";

const repo = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), "utf8");

test("at least three real devices, with an iPhone on Safari and an Android phone on Chrome", () => {
  assert.ok(DEVICES.length >= 3, "the story asks for three devices at least");
  assert.ok(DEVICES.some((d) => /iPhone/.test(d.deviceName) && d.browserName === "safari"));
  assert.ok(DEVICES.some((d) => d.os === "android" && d.browserName === "chrome"));
  for (const device of DEVICES) {
    assert.ok(device.deviceName && device.osVersion && device.browserName && device.why, `${device.deviceName} names its system, its browser and why it is there`);
  }
  assert.equal(new Set(DEVICES.map((d) => d.deviceName)).size, DEVICES.length, "no device twice");
});

test("the SDK's configuration runs every device through the tunnel and holds no credential", () => {
  const yaml = browserstackConfig({ build: "v9.0.0 abc1234" });
  assert.match(yaml, /^browserstackLocal: true$/m, "the server on the runner is reached through BrowserStack Local");
  assert.match(yaml, /^buildName: "v9\.0\.0 abc1234"$/m);
  for (const device of DEVICES) assert.ok(yaml.includes(`deviceName: "${device.deviceName}"`), `${device.deviceName} is listed`);
  assert.doesNotMatch(yaml, /userName|accessKey/, "the SDK reads the credentials from the environment, never from the file");
  assert.doesNotMatch(yaml, /^\s*why:/m, "the reasons stay out of the SDK's file");
});

test("the record of a run names the devices, the date, the version, the commit and the result", () => {
  const text = report({
    outcome: "success",
    date: "2026-11-25",
    version: "9.0.0",
    commit: "abc1234def",
    runUrl: "https://github.com/mederel/beelot/actions/runs/1"
  });
  assert.match(text, /2026-11-25/);
  assert.match(text, /9\.0\.0/);
  assert.match(text, /abc1234/);
  assert.match(text, /passed/);
  assert.match(text, /actions\/runs\/1/);
  for (const device of DEVICES) assert.ok(text.includes(device.deviceName), `${device.deviceName} is named`);
  assert.match(text, /found on the checklist/i, "it leaves room for what the person found");
  assert.match(report({ outcome: "failure", date: "d", version: "v", commit: "c", runUrl: "u" }), /failed/);
  assert.throws(() => report({ outcome: "maybe", date: "d", version: "v", commit: "c", runUrl: "u" }), /outcome/);
});

test("the workflow starts by hand or on the release-candidate label only, and does nothing without the secrets", () => {
  const workflow = read(".github/workflows/real-devices.yml");
  const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ["workflow_dispatch", "pull_request"]);
  assert.match(on, /types: \[labeled\]/, "a pull request starts it only when a label is added");
  assert.match(workflow, /github\.event\.label\.name == 'release-candidate'/);
  assert.match(workflow, /secrets\.BROWSERSTACK_USERNAME/);
  assert.match(workflow, /secrets\.BROWSERSTACK_ACCESS_KEY/);
  assert.match(workflow, /needs\.secrets\.outputs\.present == 'true'/, "the device job is skipped without the secrets");
  assert.match(workflow, /::notice::/, "a run without the secrets says why it did nothing");
});

test("the release page links the checklist, and the checklist covers the story's steps", () => {
  const release = read("pages/docs/release.html");
  assert.match(release, /docs\/real-devices\.md/);
  assert.match(release, /BROWSERSTACK_USERNAME/);
  const checklist = read("docs/real-devices.md");
  for (const step of [/orientation/i, /keyboard/i, /language/i, /private table/i, /network/i, /Android app/i]) assert.match(checklist, step);
});
