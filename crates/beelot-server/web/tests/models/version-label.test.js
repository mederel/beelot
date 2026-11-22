import { test } from "vitest";
import assert from "node:assert/strict";
import { versionView } from "$lib/models/version";

const RELEASE = "https://github.com/mederel/beelot/releases/tag/v1.12.0";

const fakeDocument = () => ({
  createElement: () => ({ append() {}, className: "" })
});
const fakeTarget = () => ({ textContent: "", hidden: true, children: [], append(child) { this.children.push(child); } });

test("a release is shown as Beelot v<version> with its release page", () => {
  assert.deepEqual(versionView({ version: "1.12.0", releaseUrl: RELEASE }), { text: "Beelot v1.12.0", href: RELEASE });
});

test("a dev build is shown as text with no link", () => {
  assert.deepEqual(versionView({ version: "dev", releaseUrl: null }), { text: "Beelot dev", href: null });
});

test("a link that is not http(s) is never used", () => {
  assert.equal(versionView({ version: "1.0.0", releaseUrl: "javascript:alert(1)" }).href, null);
});

