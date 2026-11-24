// The partner's seat, at the top of the felt: its avatar and its name stay on the table's centre line, so the partner reads
// as sitting across from the player. The recorded trick (tests/contract) is served by the route below, with Luc, the partner,
// declaring 110 clubs: the contract badge must not pull the avatar and the name off that line.
import { expect, test } from "./fixtures";
import { expectLayout } from "./layout";
import { fixture, serveApi, TABLE_ID as ID } from "./mock";

const snapshot = fixture("trick_under_review");
Object.assign(snapshot.board, {
  variant: "CONTREE",
  declaringPlayerIndex: 2,
  declaringTeam: "NORTH_SOUTH",
  contractValue: 110,
  trump: "CLUBS",
  coinched: false,
  reviewingCompletedTrick: false,
  trickWinner: null
});
snapshot.table.kind = "LOCAL";

test("the partner's avatar and name sit on the centre line of the table, with the contract badge beside them", async ({ page }) => {
  // Only the table's own snapshot is served; the other API calls find nothing, as they do for a table without them.
  await serveApi(page, { table: snapshot });
  await page.goto(`/play/bot/game/${ID}`, { waitUntil: "networkidle" });

  const seat = page.locator(".seat.top");
  await expect(seat.locator(".name")).toHaveText("Luc");
  await expect(seat.locator(".badge")).toContainText("110");

  const seatBox = (await seat.boundingBox())!;
  const axis = seatBox.x + seatBox.width / 2;
  const avatar = (await seat.locator(".avatar-wrap").boundingBox())!;
  const name = (await seat.locator(".details").boundingBox())!;
  expect(Math.abs(avatar.x + avatar.width / 2 - axis), "the avatar is centred on the seat").toBeLessThan(2);
  expect(Math.abs(name.x + name.width / 2 - axis), "the name is centred on the seat").toBeLessThan(2);
  // And nothing of the table is pushed off the screen or over another control by that badge.
  await expectLayout(page, "the table with the partner's contract badge", { pageScrolls: false });
});
