// The worst case (US-204): the key screens with the longest names, the largest numbers and the longest lists, in English, French
// and Dutch, checked for the four layout invariants and for labels that are cut or wrapped too far; then the text-size cases (the
// browser's font at 200%, the page zoomed to 200%, large text on a phone). The tables are recorded snapshots served from the
// page's side (mock.ts), so the checks run on the content that no real game produces on demand.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { type Exemption, expectLayout, findLayoutViolations, describe } from "./layout";
import { TABLE } from "./table-layout";
import { serveApi, TABLE_ID } from "./mock";
import { findTextFaults, LARGEST_SCORE, LONG_CODE, LONG_CREW_NAME, LONG_NAMES, MAX_NAME_LENGTH, worstCase } from "./extremes";

// Bulgarian (US-215) is Cyrillic, wider than Latin in some places, and Armenian (US-216) has the longest words: both run
// through every worst case.
const LANGUAGES = ["en", "fr", "nl", "hr", "bg", "hy"] as const;

const EXEMPTIONS: Exemption[] = [
  {
    selector: "input.box",
    invariant: "touch",
    below: 340,
    reason: "six boxes of 44 px need 284 px and the card of a 320 px screen leaves 248 px; they are 37 px wide, side by side, and the code can be pasted"
  }
];

const signedIn = { signedIn: true, name: LONG_NAMES[0] };

/** The page fits and no label is cut or wrapped beyond its layout. */
async function expectFits(page: Page, step: string, options: Parameters<typeof expectLayout>[2] = { exemptions: EXEMPTIONS }) {
  await expectLayout(page, step, options);
  const size = page.viewportSize();
  expect(await findTextFaults(page), `text of "${step}" at ${size?.width}×${size?.height}`).toEqual([]);
}

test("the worst-case fixture is as bad as the story says", () => {
  expect(LONG_NAMES).toHaveLength(4);
  expect(new Set(LONG_NAMES).size).toBe(4);
  for (const name of LONG_NAMES) {
    expect([...name]).toHaveLength(MAX_NAME_LENGTH);
    expect(name).not.toMatch(/\s/);
    expect(name).toMatch(/[éëïöåñžÉÅŽ]/);
    expect(name).toMatch(/🐝/);
  }
  expect(LONG_CODE).toHaveLength(6);
  expect(LONG_CREW_NAME).toHaveLength(LONG_NAMES[0].length);
  const mid = worstCase("trick_under_review");
  expect(mid.board.hand).toHaveLength(8);
  expect(mid.table.seats.map((seat: { name: string }) => seat.name)).toEqual(LONG_NAMES);
  expect(mid.board.eastWestScore).toBe(LARGEST_SCORE);
  const result = worstCase("round_over_with_announcements").board.roundResult;
  expect(result.announcements).toHaveLength(4);
  expect(result.announcements[0].announcements).toHaveLength(4);
  expect(worstCase("lobby_waiting").table.invitationCode).toBe(LONG_CODE);
});

for (const language of LANGUAGES) {
  test.describe(`in ${language}`, () => {
    test.use({ language });

    test("the Classic and the Contrée auctions", async ({ page }) => {
      await serveApi(page, { table: worstCase("classic_auction_round_2") });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.auction")).toBeVisible();
      await expectFits(page, `the Classic auction in ${language}`, TABLE);
      const contree = worstCase("contree_bidding");
      Object.assign(contree.bidding, { coincheAllowed: true, highestBidder: LONG_NAMES[1], highestBid: 110, highestBidSuit: "HEARTS" });
      await serveApi(page, { table: contree });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.auction")).toBeVisible();
      await expectFits(page, `the Contrée auction in ${language}`, TABLE);
      const bulgarian = worstCase("contree_bidding");
      Object.assign(bulgarian.bidding, { variant: "BULGARIAN", coincheAllowed: false, highestBidder: LONG_NAMES[1], highestBid: 3, highestBidSuit: "HEARTS" });
      await serveApi(page, { table: bulgarian });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.auction")).toBeVisible();
      await expectFits(page, `the Bulgarian Belot auction in ${language}`, TABLE);
      // Bazar Blot (US-216): eighteen values, the four suits and no trumps, and contra; then, after a contra, pass and recontra.
      const open = worstCase("contree_bidding");
      Object.assign(open.bidding, { variant: "BAZAR_BLOT", coincheAllowed: true, highestBidder: LONG_NAMES[1], highestBid: 9, highestBidSuit: "HEARTS" });
      await serveApi(page, { table: open });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.auction")).toBeVisible();
      await expectFits(page, `the Bazar Blot auction in ${language}`, TABLE);
      const bazar = worstCase("contree_bidding");
      Object.assign(bazar.bidding, {
        variant: "BAZAR_BLOT",
        coincheAllowed: false,
        recontraAllowed: true,
        contra: true,
        highestBidder: LONG_NAMES[1],
        highestBid: 24,
        highestBidSuit: "NO_TRUMPS"
      });
      await serveApi(page, { table: bazar });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.auction")).toBeVisible();
      await expectFits(page, `the Bazar Blot auction after a contra in ${language}`, TABLE);
    });

    test("mid-trick, with eight cards in hand", async ({ page }) => {
      await serveApi(page, { table: worstCase("trick_under_review") });
      await page.goto(`/online/private/table/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator(".hand .hand-card")).toHaveCount(8);
      await expectFits(page, `mid-trick in ${language}`, TABLE);
    });

    test("the round result and the match end", async ({ page }) => {
      const result = worstCase("round_over_with_announcements");
      await serveApi(page, { table: result });
      await page.goto(`/play/bot/game/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.result")).toBeVisible();
      await expectFits(page, `the round result in ${language}`, TABLE);
      // Bazar Blot (US-216): the longest score text, a failed bid under recontra written in tens.
      const bazar = worstCase("round_over_with_announcements");
      Object.assign(bazar.board, { variant: "BAZAR_BLOT", coinched: true, recontra: true });
      Object.assign(bazar.board.roundResult, { contractMade: false, capotTeam: null, northSouthBid: 24, eastWestBid: 0 });
      await serveApi(page, { table: bazar });
      await page.goto(`/play/bot/game/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.result")).toBeVisible();
      await expectFits(page, `the Bazar Blot round result in ${language}`, TABLE);
      const end = worstCase("round_over_with_announcements");
      end.match = {
        complete: true,
        eastWest: LARGEST_SCORE,
        northSouth: LARGEST_SCORE - 1,
        winner: LONG_NAMES[0],
        target: 1000,
        recap: {
          rounds: 99,
          biggestRound: { round: 99, team: LONG_NAMES[0], points: LARGEST_SCORE },
          announcements: {
            northSouth: { tierce: 99, cinquante: 99, cent: 99, carre: 99 },
            eastWest: { tierce: 99, cinquante: 99, cent: 99, carre: 99 }
          }
        }
      };
      await serveApi(page, { table: end });
      await page.goto(`/play/bot/game/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectFits(page, `the match end in ${language}`, TABLE);
    });

    test("the lobby, with a long code", async ({ page }) => {
      await serveApi(page, { table: worstCase("lobby_waiting") });
      await page.goto(`/online/private/table/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expect(page.locator("section.lobby")).toBeVisible();
      await expectFits(page, `the lobby in ${language}`, TABLE);
    });

    test("the crew tab with long friends and a long name", async ({ page }) => {
      const friends = {
        code: LONG_CODE,
        friends: LONG_NAMES.map((name, index) => ({ id: `f${index}`, name, online: index % 2 === 0 })),
        requests: [{ id: "r1", name: LONG_CREW_NAME }],
        invites: []
      };
      await serveApi(page, { account: signedIn, routes: { "/api/friends": friends } });
      await page.goto("/online/private", { waitUntil: "networkidle" });
      await expect(page.getByText(LONG_NAMES[1]).first()).toBeVisible();
      await page.locator("input[name=playerName]").first().fill(LONG_NAMES[2]);
      await expectFits(page, `the crew tab in ${language}`);
    });

    test("the statistics and the leaderboard with the largest numbers", async ({ page }) => {
      const row = (key: string) => ({ key, played: LARGEST_SCORE, won: LARGEST_SCORE - 1, lost: 1, winRate: 100 });
      const match = {
        endedAt: "2026-11-20T18:00:00Z",
        mode: "SOLO",
        difficulty: "CHALLENGING",
        variant: "CONTREE",
        target: 2000,
        partner: LONG_NAMES[1],
        opponents: [LONG_NAMES[2], LONG_NAMES[3]],
        teamScore: LARGEST_SCORE,
        opponentScore: LARGEST_SCORE - 1,
        won: true
      };
      const rows = LONG_NAMES.map((name, index) => ({ rank: index + 1, name, rating: 2999 - index, matches: LARGEST_SCORE }));
      await serveApi(page, {
        account: signedIn,
        routes: {
          "/api/statistics": {
            overall: { played: LARGEST_SCORE, won: LARGEST_SCORE - 1, lost: 1, winRate: 100 },
            contracts: {
              taken: LARGEST_SCORE,
              made: LARGEST_SCORE,
              coinchesByTeam: 9999,
              coinchesByTeamWon: 9999,
              coinchesAgainstTeam: 9999,
              coinchesAgainstTeamWon: 9999,
              capots: 9999,
              belotes: 9999
            },
            averagePointsPerRound: 162,
            byVariant: [row("CLASSIC"), row("CONTREE")],
            byDifficulty: [row("RELAXED"), row("CHALLENGING")],
            recentMatches: [match, match, match]
          },
          "/api/ratings": { ratings: [{ variant: "CLASSIC", rating: 2999, deviation: 350, matches: LARGEST_SCORE, history: [{ rating: 1500 }, { rating: 2999 }] }] },
          "/api/leaderboard?variant=CLASSIC": { rows, mine: { rank: 4321, name: LONG_NAMES[3], rating: 2999, matches: LARGEST_SCORE }, minMatches: 10 },
          "/api/daily?day=today": { day: "2026-11-24", variant: "CLASSIC", rows: rows.map((entry) => ({ rank: entry.rank, name: entry.name, score: 162 })) }
        }
      });
      await page.goto("/stats", { waitUntil: "networkidle" });
      await expect(page.getByText(LONG_NAMES[1]).first()).toBeVisible();
      await expectFits(page, `the statistics in ${language}`);
      await page.goto("/leaderboard", { waitUntil: "networkidle" });
      await expect(page.getByText(LONG_NAMES[0]).first()).toBeVisible();
      await expectFits(page, `the leaderboard in ${language}`);
    });

    test("settings with a long name, the Me tab and the sheets", async ({ page }) => {
      await serveApi(page, { account: signedIn });
      await page.goto("/settings", { waitUntil: "networkidle" });
      await expectFits(page, `settings in ${language}`);
      await serveApi(page);
      for (const [path, step] of [
        ["/settings", "the Me tab"],
        ["/play/bot", "the setup sheet"],
        ["/online/private/new", "the crew setup sheet"],
        ["/play/local", "the pass and play sheet"],
        ["/rules", "the rules sheet"],
        ["/tutorial", "the tutorial"],
        ["/privacy", "the privacy policy"]
      ] as const) {
        await page.goto(path, { waitUntil: "networkidle" });
        if (path === "/play/bot" || path === "/play/local") {
          for (const field of await page.locator("input.field").all()) if (await field.isVisible()) await field.fill(LONG_NAMES[0]);
        }
        await expectFits(page, `${step} in ${language}`);
      }
    });
  });
}

// The text-size cases run in Chromium, which can be told the font size the way the browser's setting does (the other engines
// have no such switch in Playwright). Every length of the page is in rem, so it follows the root font size, which is the setting.
test.describe("larger text", () => {
  // These cases set the size of their own window, so one project runs them: the others would repeat them.
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "the cases bring their own window size");
  });

  /** The browser's default font size, as its setting (not a zoom): the root font size of a page that does not set one. */
  async function setDefaultFont(page: Page, px: number) {
    const session = await page.context().newCDPSession(page);
    await session.send("Page.setFontSizes", { fontSizes: { standard: px, fixed: px, sansSerif: px, serif: px } });
  }

  /** The controls are in the viewport or reached by scrolling, and nothing makes the page wider than the screen. */
  async function expectReachable(page: Page, step: string, options: Parameters<typeof findLayoutViolations>[1] = { exemptions: EXEMPTIONS }) {
    const violations = (await findLayoutViolations(page, options)).filter((violation) => violation.invariant === "scroll" || violation.invariant === "clipped");
    const size = page.viewportSize();
    expect(violations.map(describe), `reach of "${step}" at ${size?.width}×${size?.height}`).toEqual([]);
  }

  const screens: Array<[string, string, boolean]> = [
    ["/play/bot", "the setup sheet", true],
    ["/settings", "settings", true],
    ["/online/private", "the crew tab", true],
    ["/rules", "the rules sheet", true]
  ];

  test("the default font size at 200%, on a laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setDefaultFont(page, 32);
    await serveApi(page, { account: signedIn });
    for (const [path, step] of screens) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), "the setting reaches the page").toBe(32);
      await expectReachable(page, `${step}, font at 200%`);
    }
  });

  test("the page zoomed to 200% at 1280 px", async ({ browser }) => {
    // A zoom of 200% halves the viewport in CSS pixels and doubles the pixel ratio: 1280×800 shows as 640×400.
    const context = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, locale: "en-US" });
    try {
      await context.addInitScript(() => {
        try {
          localStorage.setItem("beelot.language", "en");
          localStorage.setItem("beelot.pace", "quick");
        } catch {
          /* storage is blocked: the defaults apply */
        }
      });
      const page = await context.newPage();
      await serveApi(page, { account: signedIn });
      for (const [path, step] of screens) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expectReachable(page, `${step}, zoom at 200%`);
      }
      await serveApi(page, { table: worstCase("classic_auction_round_2") });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expectReachable(page, "the auction, zoom at 200%", TABLE);
    } finally {
      await context.close();
    }
  });

  test("large text on a phone", async ({ browser }) => {
    // What an Android phone does when its font size is set to the largest: the default font size grows to 150%.
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "en-US" });
    try {
      await context.addInitScript(() => {
        try {
          localStorage.setItem("beelot.language", "en");
          localStorage.setItem("beelot.pace", "quick");
        } catch {
          /* storage is blocked: the defaults apply */
        }
      });
      const page = await context.newPage();
      await setDefaultFont(page, 24);
      await serveApi(page, { account: signedIn });
      for (const [path, step] of screens) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expectReachable(page, `${step}, large text`);
      }
      await serveApi(page, { table: worstCase("classic_auction_round_2") });
      await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
      await expectReachable(page, "the auction, large text", TABLE);
    } finally {
      await context.close();
    }
  });
});
