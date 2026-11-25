// The layout shift of the table (US-208): a control must not move under a finger. The shift is the browser's own measure (the
// `layout-shift` entries): each step below starts from a settled page and may add almost nothing. A shift within half a second of a tap
// is counted too, although the browser's CLS leaves it out: it is the shift a tap causes that the player feels.
//
// The steps play on the real server, like the solo round: a card played and the trick that follows, a sheet opened and closed, and the
// language changed. Chromium only: the entries are Chromium's.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fixture, serveApi, TABLE_ID } from "./mock";

/** A step's shift, the sum of its entries' values: near 0, and well under the 0.1 of the page's budget (lighthouse/lighthouserc.json). */
const STEP_BUDGET = 0.02;

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; sources: string[] }[] = [];
    (window as any).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        shifts.push({
          value: entry.value,
          sources: (entry.sources ?? []).map((s: any) => `${s.node?.nodeName ?? "?"}.${(s.node as Element | null)?.className ?? ""}`)
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Runs a step and returns what shifted during it, after the page had a moment to settle. */
async function shiftDuring(page: Page, step: () => Promise<void>) {
  await page.waitForTimeout(500);
  await page.evaluate(() => ((window as any).__shifts.length = 0));
  await step();
  await page.waitForTimeout(800);
  const shifts = await page.evaluate(() => (window as any).__shifts as { value: number; sources: string[] }[]);
  return { total: shifts.reduce((sum, shift) => sum + shift.value, 0), shifts };
}

test.describe("layout shift", () => {
  // The table is laid out in three rows (the header, the felt, the hand and the bids): the felt must not be drawn at the size it has
  // before the hand and the bids exist, then shrink when they arrive. Lighthouse measured this at 0.33 on a solo table (the budget is 0.1).
  for (const [name, path] of [
    ["the auction", `/play/bot/bidding/${TABLE_ID}`],
    ["a trick", `/play/bot/game/${TABLE_ID}`]
  ] as const) {
    test(`opening a table at ${name} shifts nothing`, async ({ page }) => {
      await watchShifts(page);
      await serveApi(page, { table: fixture(name === "the auction" ? "classic_auction_round_2" : "trick_under_review") });
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator(".hand")).toBeVisible();
      await page.waitForTimeout(1500);
      const shifts = await page.evaluate(() => (window as any).__shifts as { value: number; sources: string[] }[]);
      const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
      expect(total, `opening the table shifted ${JSON.stringify(shifts)}`).toBeLessThan(STEP_BUDGET);
    });
  }

  test("playing a card, opening a sheet and changing the language move nothing under a finger", async ({ page }) => {
    test.setTimeout(120_000);
    await watchShifts(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /play now/i }).click();
    await page.getByRole("button", { name: /deal the cards/i }).click();

    // Get to the first card to play: take the contract when it can be taken, pass otherwise.
    const card = page.locator("button.hand-card.legal").first();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !(await card.count())) {
      await page.waitForTimeout(300);
      const take = page.locator(".auction button:not([disabled])", { hasText: /^(Take|Bid)/ }).first();
      const pass = page.locator(".auction button:not([disabled])", { hasText: /^Pass/ }).first();
      if (await take.count()) await take.click({ timeout: 2000 }).catch(() => {});
      else if (await pass.count()) await pass.click({ timeout: 2000 }).catch(() => {});
    }
    await expect(card).toBeVisible();

    const played = await shiftDuring(page, async () => {
      await card.click({ timeout: 2000 }).catch(() => card.click({ position: { x: 6, y: 30 }, timeout: 2000 }));
      await expect(page.locator(".trick")).toBeVisible();
      // The other seats play their cards and the trick is taken.
      await page.waitForTimeout(3000);
    });
    expect(played.total, `playing a trick shifted ${JSON.stringify(played.shifts)}`).toBeLessThan(STEP_BUDGET);

    const sheet = await shiftDuring(page, async () => {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("button", { name: "Help" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    });
    expect(sheet.total, `opening a sheet shifted ${JSON.stringify(sheet.shifts)}`).toBeLessThan(STEP_BUDGET);

    await page.goto("/settings", { waitUntil: "networkidle" });
    const language = await shiftDuring(page, async () => {
      await page.getByRole("radio", { name: "Français" }).check({ force: true });
      await expect(page.getByRole("heading", { level: 1, name: "Paramètres" })).toBeVisible();
    });
    expect(language.total, `changing the language shifted ${JSON.stringify(language.shifts)}`).toBeLessThan(STEP_BUDGET);
  });
});
