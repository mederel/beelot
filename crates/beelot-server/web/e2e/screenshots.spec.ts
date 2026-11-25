// A screenshot of each key screen on six sizes, compared with the approved image committed in e2e/screenshots (US-205). This
// spec has its own config (playwright.screenshots.config.ts) and runs in Playwright's pinned container only
// (.github/scripts/screenshots.sh), because fonts and anti-aliasing differ by machine.
//
// What moves is frozen: the page's effects are off (fixtures.ts) and the screenshot disables animations, every table is a
// recorded snapshot (mock.ts), and the clock is one instant.
import { expect, test } from "./fixtures";
import { SCREENS, TRANSLATED } from "./screenshot-list";
import { fixture, serveApi, type Snapshot, TABLE_ID } from "./mock";

const NOW = new Date("2026-11-20T12:00:00Z");
const signedIn = { signedIn: true, name: "Ana" };

/** A table of a recorded snapshot, opened at its address. */
async function openTable(page: import("@playwright/test").Page, table: Snapshot, path: string) {
  await serveApi(page, { table, account: { signedIn: false } });
  await page.goto(path, { waitUntil: "networkidle" });
}

/** Opens a screen and waits until it is the screen that is shown. */
const SHOW: Record<(typeof SCREENS)[number], (page: import("@playwright/test").Page) => Promise<void>> = {
  async home(page) {
    await serveApi(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("main, #app").first()).not.toBeEmpty();
  },
  async setup(page) {
    await serveApi(page);
    await page.goto("/play/bot", { waitUntil: "networkidle" });
    await expect(page.locator("label.variant").first()).toBeVisible();
  },
  async auction(page) {
    await openTable(page, fixture("classic_auction_round_2"), `/play/bot/bidding/${TABLE_ID}`);
    await expect(page.locator("section.auction")).toBeVisible();
    await expect(page.locator(".hand")).toBeVisible();
  },
  async "mid-trick"(page) {
    await openTable(page, fixture("trick_under_review"), `/online/private/table/${TABLE_ID}`);
    await expect(page.locator(".hand")).toBeVisible();
    await expect(page.locator(".trick")).toBeVisible();
  },
  async "round-result"(page) {
    await openTable(page, fixture("round_over_with_announcements"), `/play/bot/game/${TABLE_ID}`);
    await expect(page.locator("section.result")).toBeVisible();
  },
  async "match-end"(page) {
    const table = fixture("round_over_with_announcements");
    table.match = {
      complete: true,
      eastWest: 1020,
      northSouth: 760,
      winner: "East–West",
      target: 1000,
      recap: {
        rounds: 6,
        biggestRound: { round: 3, team: "East–West", points: 182 },
        announcements: {
          northSouth: { tierce: 1, cinquante: 0, cent: 0, carre: 0 },
          eastWest: { tierce: 2, cinquante: 1, cent: 0, carre: 1 }
        }
      }
    };
    await openTable(page, table, `/play/bot/game/${TABLE_ID}`);
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  async lobby(page) {
    const table = fixture("lobby_waiting");
    for (const seat of table.table.seats) seat.you = seat.position === 0;
    await openTable(page, table, `/online/private/table/${TABLE_ID}`);
    await expect(page.locator("section.lobby")).toBeVisible();
  },
  async settings(page) {
    await serveApi(page, { account: signedIn });
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expect(page.getByText("Ana").first()).toBeVisible();
  }
};

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
