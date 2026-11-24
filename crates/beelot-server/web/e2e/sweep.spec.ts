// A page that ignores the sizes between two breakpoints is caught (US-202): the width goes from 320 to 1280 px in steps of 40,
// at two heights, on the home page, the setup and the table, each judged by the layout checks. The sizes are not a device's:
// the test sets the viewport itself, so it runs on one project (a touch phone, which judges the targets too).
import { expect, test } from "./fixtures";
import { type Exemption, expectLayout } from "./layout";
import { TABLE } from "./table-layout";
import { fixture, serveApi, TABLE_ID } from "./mock";

const WIDTHS = Array.from({ length: 25 }, (_, i) => 320 + i * 40);
const HEIGHTS = [568, 900];

const PAGE_EXEMPTIONS: Exemption[] = [
  {
    selector: "input.box",
    invariant: "touch",
    below: 340,
    reason: "six boxes of 44 px need 284 px and the card of a 320 px screen leaves 248 px; they are 37 px wide, side by side, and the code can be pasted"
  }
];

test.describe("the sweep of widths", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "phone-375", "the sweep sets its own sizes: one project runs it");
  });

  const screens = [
    { name: "the home page", path: "/", options: { exemptions: PAGE_EXEMPTIONS } },
    { name: "the setup", path: "/play/bot", options: { exemptions: PAGE_EXEMPTIONS } },
    { name: "the table", path: `/online/private/table/${TABLE_ID}`, options: TABLE, table: "trick_under_review" }
  ];

  for (const screen of screens) {
    test(`${screen.name} fits every width from 320 to 1280 px`, async ({ page }) => {
      test.setTimeout(180_000);
      await serveApi(page, screen.table ? { table: fixture(screen.table), account: { signedIn: false } } : {});
      const fails: string[] = [];
      for (const height of HEIGHTS) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height });
          await page.goto(screen.path, { waitUntil: "networkidle" });
          try {
            await expectLayout(page, `${screen.name}`, screen.options);
          } catch (error) {
            fails.push(
              String((error as Error).message)
                .split("\n")
                .slice(0, 8)
                .join("\n")
            );
          }
        }
      }
      expect(fails, `${fails.length} of ${WIDTHS.length * HEIGHTS.length} sizes break the layout`).toEqual([]);
    });
  }
});
