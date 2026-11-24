// A solo round played by tapping, from the deal to the review, and the result panel's text over the felt.
import { expect, test } from "./fixtures";

test("a solo round plays to its result and the review shows its analysis", async ({ page, browserName }) => {
  test.fixme(browserName === "webkit", "#482: the round never reaches its result in WebKit");
  test.setTimeout(240_000);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /play now/i }).click();
  await page.getByRole("button", { name: /deal the cards/i }).click();

  // The cards of a hand overlap, each over the one before it: a player taps the strip of a card that shows.
  // Take the contract when it can be taken, pass otherwise, and play the first card that follows the rules.
  const result = page.locator("section.result");
  const deadline = Date.now() + 130_000;
  while (Date.now() < deadline && !(await result.count())) {
    await page.waitForTimeout(300);
    const card = page.locator("button.hand-card.legal").first();
    const take = page.locator(".auction button:not([disabled])", { hasText: /^(Take|Bid)/ }).first();
    const pass = page.locator(".auction button:not([disabled])", { hasText: /^Pass/ }).first();
    if (await card.count()) await card.click({ timeout: 800 }).catch(() => card.click({ position: { x: 6, y: 30 }, timeout: 800 }).catch(() => {}));
    else if (await take.count()) await take.click({ timeout: 2000 }).catch(() => {});
    else if (await pass.count()) await pass.click({ timeout: 2000 }).catch(() => {});
  }
  await expect(result).toBeVisible();
  await expect(result.getByRole("button", { name: /review round/i })).toBeVisible();

  // Nothing of the table is drawn over the panel, and the panel itself is opaque.
  await expect.poll(() => result.evaluate((panel) => getComputedStyle(panel).opacity)).toBe("1");
  const box = (await result.boundingBox())!;
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("section.result") !== null, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  });
  expect(top, "the result panel is on top").toBe(true);
  const background = await result.evaluate((panel) => getComputedStyle(panel).backgroundImage);
  expect(background, "the panel's colours have no transparency").not.toMatch(/rgba\(/);

  await result.getByRole("button", { name: /review round/i }).click();
  await expect(page.getByText(/Costly cards: \d+|No costly card/i).first()).toBeVisible({ timeout: 15_000 });
});
