// Every screen loads at every size without a script error, a policy violation or a sideways scroll.
import { expect, test } from "./fixtures";

const PATHS = ["/", "/play/bot", "/play/local", "/online/private", "/online/private/new", "/online/public", "/tutorial", "/rules", "/stats", "/leaderboard", "/settings", "/privacy"];

for (const path of PATHS) {
  test(`${path} fits the screen and runs without an error`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("main, #app").first()).not.toBeEmpty();
    expect(await page.title()).not.toBe("");
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(innerWidth);
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
