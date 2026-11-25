// The key screens, each shown in one step from the recorded snapshots of tests/contract (mock.ts): the screenshots (US-205) and the
// accessibility checks (US-207) look at the same eight screens, so a screen is added in one place.
import { expect, type Page } from "@playwright/test";
import type { SCREENS } from "./screenshot-list";
import { fixture, serveApi, type Snapshot, TABLE_ID } from "./mock";

const signedIn = { signedIn: true, name: "Ana" };

/** A table of a recorded snapshot, opened at its address. */
export async function openTable(page: Page, table: Snapshot, path: string) {
  await serveApi(page, { table, account: { signedIn: false } });
  await page.goto(path, { waitUntil: "networkidle" });
}

/** Opens a screen and waits until it is the screen that is shown. */
export const SHOW: Record<(typeof SCREENS)[number], (page: Page) => Promise<void>> = {
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
