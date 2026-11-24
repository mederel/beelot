// The self-test of the layout helper (US-201): a page that overflows, clips, overlaps and has a small target must be caught,
// and a page that fits must pass, so that the helper cannot silently stop detecting. It needs no server.
import { expect, test } from "./fixtures";
import { findLayoutViolations, type Violation } from "./layout";

const BAD = `
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px sans-serif }
  #wide { width: 3000px; height: 20px; background: #ccc }
  #clipped { position: absolute; left: -30px; top: 100px; width: 120px; height: 50px }
  #cut { width: 100px; height: 40px; overflow: hidden; margin-top: 200px }
  #cut button { margin-left: 70px; width: 100px; height: 40px }
  #under { position: absolute; left: 20px; top: 300px; width: 120px; height: 50px }
  #over { position: absolute; left: 60px; top: 320px; width: 120px; height: 50px }
  #tiny { position: absolute; left: 20px; top: 420px; width: 20px; height: 20px; padding: 0 }
  .hand { position: absolute; left: 0; top: 480px; width: 200px; height: 60px; background: #eee }
  section.auction { position: absolute; left: 0; top: 500px; width: 200px; height: 60px; background: #ddd }
</style>
<div id="wide">too wide</div>
<button id="clipped">Pushed left</button>
<div id="cut"><button>Cut off</button></div>
<button id="under">Under</button>
<button id="over">Over</button>
<button id="tiny" aria-label="Tiny"></button>
<div class="hand" role="group" aria-label="Hand"></div>
<section class="auction" aria-label="Auction"></section>`;

const GOOD = `
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px sans-serif }
  button { min-width: 48px; min-height: 48px; margin: 8px }
  .scroller { width: 200px; overflow-x: auto; white-space: nowrap }
  .scroller button { width: 150px }
</style>
<button>Play</button><button>Pass</button>
<div class="scroller"><button>One</button><button>Two</button><button>Three</button></div>
<div role="dialog" aria-modal="true" style="position: fixed; inset: 0; background: white"><button>Close</button></div>`;

const find = (violations: Violation[], invariant: string, text: string) => violations.find((v) => v.invariant === invariant && (v.element + v.detail).includes(text));

test("the helper catches a page that overflows, clips, overlaps and has a small target", async ({ page }) => {
  await page.setContent(BAD);
  const violations = await findLayoutViolations(page);
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);

  const scroll = find(violations, "scroll", "scrolls sideways");
  expect(scroll, "a sideways scroll is caught").toBeDefined();
  expect(scroll!.element, "it names the widest element").toContain("wide");
  expect(find(violations, "scroll", "3000"), "an element wider than the viewport is named with its width").toBeDefined();
  expect(find(violations, "clipped", 'button "Pushed left"'), "a control off the screen is caught").toBeDefined();
  expect(find(violations, "clipped", 'button "Cut off"'), "a control cut by an ancestor is caught").toBeDefined();
  expect(find(violations, "overlap", "Under"), "two controls over each other are caught").toBeDefined();
  expect(find(violations, "overlap", "covers the auction panel"), "the hand over the auction panel is caught").toBeDefined();
  if (touch) {
    const small = find(violations, "touch", "20");
    expect(small, "a small target is caught on a touch profile").toBeDefined();
    expect(small!.element).toContain('"Tiny"');
  } else {
    expect(find(violations, "touch", ""), "touch targets are not judged without a touch screen").toBeUndefined();
  }
});

test("the helper passes a page that fits, a scrollable strip and an overlay over the page", async ({ page }) => {
  await page.setContent(GOOD);
  expect((await findLayoutViolations(page)).map((v) => `${v.invariant}: ${v.element} ${v.detail}`)).toEqual([]);
});

test("an exemption silences its invariant for its elements only", async ({ page }) => {
  await page.setContent(BAD);
  const violations = await findLayoutViolations(page, {
    exemptions: [
      { selector: "#clipped", invariant: "clipped", reason: "self-test" },
      { selector: "#tiny", invariant: "touch", reason: "self-test" }
    ]
  });
  expect(find(violations, "clipped", "Pushed left")).toBeUndefined();
  expect(find(violations, "touch", "Tiny")).toBeUndefined();
  expect(find(violations, "clipped", "Cut off"), "the other elements are still judged").toBeDefined();
});
