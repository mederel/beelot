// A screenshot of each key screen on six sizes, compared with the approved image committed in e2e/screenshots (US-205). This
// spec has its own config (playwright.screenshots.config.ts) and runs in Playwright's pinned container only
// (.github/scripts/screenshots.sh), because fonts and anti-aliasing differ by machine.
//
// What moves is frozen: the page's effects are off (fixtures.ts) and the screenshot disables animations, every table is a
// recorded snapshot (mock.ts), and the clock is one instant.
import { expect, test } from "./fixtures";
import { SCREENS, TRANSLATED } from "./screenshot-list";
import { SHOW } from "./screens";

const NOW = new Date("2026-11-20T12:00:00Z");

/** Shows a screen as the story freezes it, then waits until nothing is left to settle. */
async function photograph(page: import("@playwright/test").Page, screen: (typeof SCREENS)[number], image: string) {
  await page.clock.setFixedTime(NOW);
  await SHOW[screen](page);
  // The check that proves the job can fail (BEELOT_SCREENSHOT_SABOTAGE, see the CI job): the page moves by a few pixels.
  if (process.env.BEELOT_SCREENSHOT_SABOTAGE) await page.evaluate(() => document.documentElement.style.setProperty("filter", "hue-rotate(25deg)"));
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${image}.png`);
}

test.describe("the key screens in English", () => {
  for (const screen of SCREENS) {
    test(`the ${screen.replace("-", " ")}`, async ({ page }) => {
      await photograph(page, screen, screen);
    });
  }
});

for (const [language, screen] of Object.entries(TRANSLATED)) {
  test.describe(`the ${screen.replace("-", " ")} in ${language === "fr" ? "French" : "Dutch"}`, () => {
    test.use({ language, locale: language === "fr" ? "fr-FR" : "nl-NL" });
    test(`the ${screen.replace("-", " ")}`, async ({ page }) => {
      await photograph(page, screen, `${screen}-${language}`);
    });
  });
}
