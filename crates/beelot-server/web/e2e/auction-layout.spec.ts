// The bidding player's hand stays on screen while the auction panel is open: the panel's choices shrink with the screen, so a
// Contrée call with a coinche still leaves the cards to play in view on a phone.
import { expect, test } from "./fixtures";
import { expectLayout } from "./layout";
import { TABLE } from "./table-layout";

test("the hand stays on screen while the auction panel is open", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /play now/i }).click();
  await page.locator("label.variant", { hasText: "Contrée" }).click();
  await page.getByRole("button", { name: /deal the cards/i }).click();

  const auction = page.locator("section.auction");
  const deadline = Date.now() + 240_000;
  let checked = 0;
  while (Date.now() < deadline && checked < 2) {
    if (await auction.isVisible().catch(() => false)) {
      // The panel flies in and out: measure it once it has settled, and only while it is still open.
      await page.waitForTimeout(500);
      if (await auction.isVisible().catch(() => false)) {
        // The hand is drawn, inside the screen and not under the panel (the helper's clipped and overlap invariants).
        await expect(page.locator(".hand")).toBeVisible();
        await expectLayout(page, "the auction panel over the table", TABLE);
        checked++;
        // Pass when the player may, so that the auction moves on to the next call.
        await page
          .locator(".auction button:not([disabled])", { hasText: /^Pass/ })
          .first()
          .click({ timeout: 2000 })
          .catch(() => {});
      }
    }
    await page.waitForTimeout(300);
  }
  expect(checked, "the player's auction was shown").toBeGreaterThan(0);
});
