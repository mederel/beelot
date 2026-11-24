// Every screen loads at every size without a script error, a policy violation or a layout fault (scroll, clip, overlap, target).
import { expect, test } from "./fixtures";
import { type Exemption, expectLayout } from "./layout";

// The exemptions the screens need, each with its reason (US-201).
const EXEMPTIONS: Exemption[] = [
  {
    selector: "input.box",
    invariant: "touch",
    below: 340,
    reason:
      "six boxes of 44 px and their gaps need 284 px and the card of a 320 px screen leaves 248 px; each box is 37 px wide and 47 px tall, side by side, and the code can be pasted into any of them"
  }
];

const PATHS = [
  "/",
  "/play/bot",
  "/play/local",
  "/online/private",
  "/online/private/new",
  "/online/public",
  "/tutorial",
  "/rules",
  "/stats",
  "/leaderboard",
  "/settings",
  "/privacy"
];

for (const path of PATHS) {
  test(`${path} fits the screen and runs without an error`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("main, #app").first()).not.toBeEmpty();
    expect(await page.title()).not.toBe("");
    await expectLayout(page, path, { exemptions: EXEMPTIONS });
    // Every suit is an svg we draw: no page's text holds a suit character or the variation selector that makes it an emoji.
    const text = await page.evaluate(() => document.body.textContent ?? "");
    expect(text, `${path} writes a suit as a character`).not.toMatch(/[\u2660-\u2667]|\uFE0F/u);
  });
}

test("the invitation code boxes keep a deleted character deleted", async ({ page }) => {
  await page.goto("/online/private", { waitUntil: "networkidle" });
  const boxes = page.locator('input[aria-label^="Character"]');
  await expect(boxes).toHaveCount(6);
  await boxes.first().click();
  await page.keyboard.type("ABC234");
  expect(await boxes.evaluateAll((all) => all.map((box) => (box as HTMLInputElement).value).join(""))).toBe("ABC234");
  // The caret goes after the character, as it does when a player taps the end of a box.
  await boxes.nth(2).focus();
  await page.keyboard.press("Backspace");
  expect(await boxes.evaluateAll((all) => all.map((box) => (box as HTMLInputElement).value || "_").join(""))).toBe("AB_234");
});
