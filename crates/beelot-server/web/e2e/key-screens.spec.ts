// The key screens, each driven to its state and checked for the four layout invariants (US-201): no sideways scroll, nothing
// clipped, nothing overlapping, touch targets of 44 px. The tables are the recorded snapshots of tests/contract, served from the
// page's side (mock.ts), so that a state like the match end is reached in one step and is the same on every run and every size.
// The tests that play a real round (solo-round, auction-layout) call the same helper on the live game.
import { expect, test } from "./fixtures";
import { type Exemption, expectLayout } from "./layout";
import { fixture, serveApi, type Snapshot, TABLE_ID } from "./mock";

// The exemptions the table needs, each with its reason (US-201). The table fills the screen and does not scroll: nothing of it
// may lie below the fold.
const TABLE_EXEMPTIONS: Exemption[] = [
  {
    selector: "section.auction button",
    invariant: "touch",
    reason:
      "the auction panel's choices shrink with the screen so that the player's hand stays in view (auction-layout, #253): they are 38 to 43 px tall, at least 120 px wide and 0.4 rem apart"
  },
  {
    selector: ".icon-button.hint, a.account",
    invariant: "overlap",
    below: 600,
    reason:
      "KNOWN FAULT, needs a design decision: US-200 fixes the account button at the top right of the table, where the header's hint button is, and a phone in portrait has no room for both; the hint is also in the table menu. Remove this exemption when the header leaves room for the account button"
  }
];
const TABLE = { pageScrolls: false, exemptions: TABLE_EXEMPTIONS };
const EXEMPTIONS: Exemption[] = [
  {
    selector: "input.box",
    invariant: "touch",
    below: 340,
    reason: "six boxes of 44 px need 284 px and the card of a 320 px screen leaves 248 px; they are 37 px wide, side by side, and the code can be pasted"
  }
];

const guest = { signedIn: false };
const signedIn = { signedIn: true, name: "Ana" };

/** The table of a snapshot, opened at the address of its kind. */
async function openTable(page: import("@playwright/test").Page, table: Snapshot, path: string, account: object = guest) {
  await serveApi(page, { table, account });
  await page.goto(path, { waitUntil: "networkidle" });
}

test.describe("the table", () => {
  test("the Classic auction, with the choices of the player's turn", async ({ page }) => {
    await openTable(page, fixture("classic_auction_round_2"), `/play/bot/bidding/${TABLE_ID}`);
    await expect(page.locator("section.auction")).toBeVisible();
    await expect(page.locator(".hand")).toBeVisible();
    await expectLayout(page, "the Classic auction", TABLE);
  });

  test("the Contrée auction, with a value, a suit and the coinche", async ({ page }) => {
    const table = fixture("contree_bidding");
    // An opponent holds the highest bid, and coinche is allowed: the panel shows its choices and the coinche button.
    Object.assign(table.bidding, { coincheAllowed: true, highestBidder: "Camille", highestBid: 110, highestBidSuit: "HEARTS" });
    await openTable(page, table, `/play/bot/bidding/${TABLE_ID}`);
    await expect(page.locator("section.auction")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Coinche/ })).toBeVisible();
    await expectLayout(page, "the Contrée auction with the coinche choice", TABLE);
  });

  test("mid-trick: the cards played, the hand and the scores", async ({ page }) => {
    await openTable(page, fixture("trick_under_review"), `/online/private/table/${TABLE_ID}`);
    await expect(page.locator(".hand")).toBeVisible();
    await expect(page.locator(".trick")).toBeVisible();
    await expectLayout(page, "mid-trick", TABLE);
  });

  test("the round result and its review", async ({ page }) => {
    await openTable(page, fixture("round_over_with_announcements"), `/play/bot/game/${TABLE_ID}`);
    const result = page.locator("section.result");
    await expect(result).toBeVisible();
    await expectLayout(page, "the round result", TABLE);
    await result.getByRole("button", { name: /review round/i }).click();
    await expect(page.getByRole("dialog", { name: /review round/i })).toBeVisible();
    await expectLayout(page, "the round review", TABLE);
  });

  test("the match end", async ({ page }) => {
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
    await expect(page.getByRole("dialog", { name: /win the match/i })).toBeVisible();
    await expectLayout(page, "the match end", TABLE);
  });
});

test.describe("a private table's lobby", () => {
  // Two players, each in a browser context of their own, see the same lobby from their seat.
  test("the lobby of the owner and of the guest", async ({ page, browser }, testInfo) => {
    const owner = fixture("lobby_waiting");
    for (const seat of owner.table.seats) seat.you = seat.position === 0;
    await openTable(page, owner, `/online/private/table/${TABLE_ID}`);
    await expect(page.locator("section.lobby")).toBeVisible();
    await expectLayout(page, "the lobby, as the owner", TABLE);

    const { viewport, hasTouch, isMobile, deviceScaleFactor, userAgent } = testInfo.project.use;
    const context = await browser.newContext({ viewport, hasTouch, isMobile, deviceScaleFactor, userAgent, locale: "en-US" });
    try {
      await context.addInitScript(() => {
        try {
          localStorage.setItem("beelot.language", "en");
          localStorage.setItem("beelot.pace", "quick");
        } catch {
          /* storage is blocked: the defaults apply */
        }
      });
      const other = await context.newPage();
      const guestView = fixture("lobby_waiting");
      for (const seat of guestView.table.seats) seat.you = seat.position === 1;
      await openTable(other, guestView, `/online/private/table/${TABLE_ID}`);
      await expect(other.locator("section.lobby")).toBeVisible();
      await expectLayout(other, "the lobby, as the guest", TABLE);
    } finally {
      await context.close();
    }
  });
});

test.describe("the pages", () => {
  const friends = {
    code: "ABC234",
    friends: [
      { id: "f1", name: "Camille", online: true },
      { id: "f2", name: "Luc", online: false }
    ],
    requests: [{ id: "r1", name: "Manon" }],
    invites: []
  };

  test("the crew and friends tab, signed in", async ({ page }) => {
    await serveApi(page, { account: signedIn, routes: { "/api/friends": friends } });
    await page.goto("/online/private", { waitUntil: "networkidle" });
    await expect(page.getByText("Camille")).toBeVisible();
    await expectLayout(page, "the crew and friends tab", { exemptions: EXEMPTIONS });
  });

  test("the crew tab, as a guest", async ({ page }) => {
    await serveApi(page);
    await page.goto("/online/private", { waitUntil: "networkidle" });
    await expectLayout(page, "the crew tab as a guest", { exemptions: EXEMPTIONS });
  });

  test("the statistics, with a record, a rating and recent matches", async ({ page }) => {
    const row = (key: string, played: number, won: number) => ({ key, played, won, lost: played - won, winRate: Math.round((100 * won) / played) });
    const match = (won: boolean) => ({
      endedAt: "2026-11-20T18:00:00Z",
      mode: "SOLO",
      difficulty: "RELAXED",
      variant: "CONTREE",
      target: 1000,
      partner: "Camille",
      opponents: ["Luc", "Manon"],
      teamScore: won ? 1020 : 870,
      opponentScore: won ? 870 : 1020,
      won
    });
    await serveApi(page, {
      account: signedIn,
      routes: {
        "/api/statistics": {
          overall: { played: 12, won: 7, lost: 5, winRate: 58 },
          contracts: { taken: 20, made: 14, coinchesByTeam: 2, coinchesByTeamWon: 1, coinchesAgainstTeam: 1, coinchesAgainstTeamWon: 0, capots: 1, belotes: 3 },
          averagePointsPerRound: 84,
          byVariant: [row("CLASSIC", 8, 5), row("CONTREE", 4, 2)],
          byDifficulty: [row("RELAXED", 9, 6), row("CHALLENGING", 3, 1)],
          recentMatches: [match(true), match(false), match(true)]
        },
        "/api/ratings": {
          ratings: [
            { variant: "CLASSIC", rating: 1520, deviation: 90, matches: 14, history: [{ rating: 1500 }, { rating: 1512 }, { rating: 1520 }] },
            { variant: "CONTREE", rating: 1480, deviation: 160, matches: 3, history: [{ rating: 1500 }, { rating: 1480 }] }
          ]
        }
      }
    });
    await page.goto("/stats", { waitUntil: "networkidle" });
    await expect(page.getByText("Matches played")).toBeVisible();
    await expectLayout(page, "the statistics", { exemptions: EXEMPTIONS });
  });

  test("the statistics, as a guest asked to sign in", async ({ page }) => {
    await serveApi(page, { routes: { "/api/statistics": { status: 401, json: {} } } });
    await page.goto("/stats", { waitUntil: "networkidle" });
    await expect(page.getByText(/sign in to see your statistics/i)).toBeVisible();
    await expectLayout(page, "the statistics as a guest", { exemptions: EXEMPTIONS });
  });

  test("the leaderboard and the daily deal", async ({ page }) => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      rank: index + 1,
      name: ["Ana", "Camille", "Luc", "Manon", "Ben", "Zoé", "Inès", "Hugo"][index],
      rating: 1800 - index * 40,
      matches: 40 - index
    }));
    await serveApi(page, {
      account: signedIn,
      routes: {
        "/api/leaderboard?variant=CLASSIC": { rows, mine: { rank: 4, name: "Manon", rating: 1680, matches: 37 }, minMatches: 10 },
        "/api/daily?day=today": {
          day: "2026-11-24",
          variant: "CLASSIC",
          rows: rows.slice(0, 3).map((entry) => ({ rank: entry.rank, name: entry.name, score: 160 - entry.rank * 10 }))
        }
      }
    });
    await page.goto("/leaderboard", { waitUntil: "networkidle" });
    await expect(page.getByText("Camille").first()).toBeVisible();
    await expectLayout(page, "the leaderboard", { exemptions: EXEMPTIONS });
  });

  test("settings, signed in", async ({ page }) => {
    await serveApi(page, { account: signedIn });
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expectLayout(page, "settings", { exemptions: EXEMPTIONS });
  });

  test("the Me tab with the sign-in panel, as a guest", async ({ page }) => {
    await serveApi(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    // Open the sign-in panel when the page offers it behind a button.
    const signIn = page.getByRole("button", { name: /^sign in/i }).first();
    if (await signIn.isVisible().catch(() => false)) await signIn.click();
    await expectLayout(page, "the Me tab with the sign-in panel", { exemptions: EXEMPTIONS });
  });

  test("the privacy policy", async ({ page }) => {
    await serveApi(page);
    await page.goto("/privacy", { waitUntil: "networkidle" });
    await expectLayout(page, "the privacy policy", { exemptions: EXEMPTIONS });
  });

  test("the tutorial: the lessons and the first question", async ({ page }) => {
    await serveApi(page);
    await page.goto("/tutorial", { waitUntil: "networkidle" });
    await expectLayout(page, "the tutorial", { exemptions: EXEMPTIONS });
  });
});

test.describe("the sheets", () => {
  test("the setup sheet, with each variant and the bots' strength", async ({ page }) => {
    await serveApi(page);
    await page.goto("/play/bot", { waitUntil: "networkidle" });
    await expectLayout(page, "the setup sheet, Classic", { exemptions: EXEMPTIONS });
    await page.locator("label.variant", { hasText: "Contrée" }).click();
    await expectLayout(page, "the setup sheet, Contrée", { exemptions: EXEMPTIONS });
  });

  test("the setup sheet of a private table and of pass and play", async ({ page }) => {
    await serveApi(page);
    await page.goto("/online/private/new", { waitUntil: "networkidle" });
    await expectLayout(page, "the setup sheet, crew", { exemptions: EXEMPTIONS });
    await page.goto("/play/local", { waitUntil: "networkidle" });
    await expectLayout(page, "the setup sheet, pass and play", { exemptions: EXEMPTIONS });
  });

  test("the rules sheet", async ({ page }) => {
    await serveApi(page);
    await page.goto("/rules", { waitUntil: "networkidle" });
    await expectLayout(page, "the rules sheet", { exemptions: EXEMPTIONS });
  });
});
