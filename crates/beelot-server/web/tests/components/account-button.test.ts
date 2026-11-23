// The account button at the top right (US-200): nothing before the account loads, a guest's "Sign in" pill that asks for the
// sign-in panel, and a signed-in player's button named after the account.
import assert from "node:assert/strict";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, test } from "vitest";
import { account, signInRequest } from "$lib/stores/account.svelte";
import AccountButton from "../../src/shell/AccountButton.svelte";

let app: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  account.loaded = false;
  account.signedIn = false;
  account.name = null;
  signInRequest.open = false;
  signInRequest.signUp = false;
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  document.body.replaceChildren();
});

function show(): HTMLElement {
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(AccountButton, { target });
  flushSync();
  return target;
}

test("nothing is shown until the account has loaded", () => {
  const target = show();
  assert.equal(target.querySelector("a"), null);
});

test("a guest sees the sign-in pill, which asks for the sign-in panel of the Me tab", () => {
  account.loaded = true;
  const target = show();
  const link = target.querySelector<HTMLAnchorElement>("a");
  assert.ok(link, "a link is shown");
  assert.equal(link.getAttribute("href"), "/settings");
  assert.match(link.textContent ?? "", /Sign in/);
  assert.equal(link.getAttribute("aria-label"), null, "the visible text names the state");
  link.click();
  assert.equal(signInRequest.open, true);
  assert.equal(signInRequest.signUp, false);
});

test("a signed-in player sees an icon named after the account, with no sign-in text", () => {
  account.loaded = true;
  account.signedIn = true;
  account.name = "Ada";
  const target = show();
  const link = target.querySelector<HTMLAnchorElement>("a");
  assert.ok(link, "a link is shown");
  assert.equal(link.getAttribute("href"), "/settings");
  assert.equal(link.getAttribute("aria-label"), "Signed in as Ada");
  assert.doesNotMatch(link.textContent ?? "", /Sign in/);
  link.click();
  assert.equal(signInRequest.open, false, "a signed-in player is not asked to sign in");
});
