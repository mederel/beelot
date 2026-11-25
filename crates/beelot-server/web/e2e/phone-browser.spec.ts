// What a phone's browser does to the page (US-206): a notch and a home indicator, a keyboard that takes almost half the screen,
// address and tool bars that hide and show, and a phone turned on its side. The tables are the recorded snapshots of tests/contract
// served from the page's side (mock.ts), so a screen is reached in one step and is the same on every run.
//
// The browser's own behaviour is emulated, not reproduced: Chromium's `Emulation.setSafeAreaInsetsOverride` gives the page
// `env(safe-area-inset-*)` (no other engine has it, so the inset cases run in Chromium only); a keyboard is a viewport 45% shorter
// (what Android does when a page asks the layout viewport to resize, and what the visual viewport of iOS shows); the bars are a
// height change of 56 px; and turning the phone swaps the width and the height. Playwright has no real orientation change.
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { type Exemption, expectLayout } from "./layout";
import { TABLE } from "./table-layout";
import { fixture, serveApi, type Snapshot, TABLE_ID } from "./mock";

type Insets = { top: number; bottom: number; left: number; right: number };

/** A phone in portrait, with a notch and a home indicator (an iPhone 14: 47 px and 34 px). */
const NOTCH: Insets = { top: 47, bottom: 34, left: 0, right: 0 };
/** A phone on its side: the notch is on one side, the home indicator is thin, and the other side keeps the rounded corner's room. */
const LANDSCAPE_NOTCH: Insets = { top: 0, bottom: 21, left: 47, right: 47 };
/** What the keyboard takes of the height. */
const KEYBOARD = 0.45;
/** What the address bar and the tool bar take of the height of a phone's browser, in CSS pixels. */
const BARS = 56;

const EXEMPTIONS: Exemption[] = [
  {
    selector: "input.box",
    invariant: "touch",
    below: 340,
    reason: "six boxes of 44 px need 284 px and the card of a 320 px screen leaves 248 px; they are 37 px wide, side by side, and the code can be pasted"
  }
];

const size = (info: TestInfo) => info.project.use.viewport as { width: number; height: number };
const isPhone = (info: TestInfo) => info.project.use.isMobile === true && Math.min(size(info).width, size(info).height) < 500;
const isPortrait = (info: TestInfo) => size(info).height > size(info).width;
const isChromium = (info: TestInfo) => (info.project.use.browserName ?? "chromium") === "chromium";

async function setInsets(page: Page, insets: Insets): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride" as never, { insets } as never);
}

/** The visible controls whose box reaches into the unsafe bands of the screen, each named with its place. */
async function controlsUnderInsets(page: Page, insets: Insets, bands: (keyof Insets)[]): Promise<string[]> {
  return page.evaluate(
    ({ insets, bands }) => {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const found: string[] = [];
      const controls = document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="link"]');
      for (const el of controls) {
        if (el.closest('.skip, [aria-hidden="true"], [inert], [hidden]')) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) continue;
        // A control inside a scroller made for it (a row of chips) is judged by the scroller: the rest of it is reached by scrolling.
        let box: Element = el;
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          const overflow = getComputedStyle(up);
          if (/(auto|scroll)/.test(overflow.overflowX) && up.scrollWidth > up.clientWidth) box = up;
        }
        const r = box.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1 || r.bottom <= 0 || r.top >= height || r.right <= 0 || r.left >= width) continue;
        const under: string[] = [];
        if (bands.includes("top") && r.top < insets.top - 1) under.push(`top (${Math.round(r.top)} < ${insets.top})`);
        if (bands.includes("bottom") && r.bottom > height - insets.bottom + 1) under.push(`bottom (${Math.round(r.bottom)} > ${height - insets.bottom})`);
        if (bands.includes("left") && r.left < insets.left - 1) under.push(`left (${Math.round(r.left)} < ${insets.left})`);
        if (bands.includes("right") && r.right > width - insets.right + 1) under.push(`right (${Math.round(r.right)} > ${width - insets.right})`);
        if (!under.length) continue;
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 30);
        found.push(
          `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""} "${name}" under the ${under.join(", ")}`
        );
      }
      return found;
    },
    { insets, bands }
  );
}

/** Scrolls the page and every scroller of it (a sheet is one) to its start or to its end. */
async function scrollEverything(page: Page, where: "start" | "end"): Promise<void> {
  await page.evaluate((to) => {
    for (const el of [document.scrollingElement, ...document.querySelectorAll("*")]) {
      if (!el || el.scrollHeight <= el.clientHeight) continue;
      if (el !== document.scrollingElement && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      el.scrollTop = to === "start" ? 0 : el.scrollHeight;
    }
  }, where);
}

/**
 * No control sits under the notch, the home indicator or a rounded corner. A page that scrolls is looked at at its top (the top and
 * the sides) and at its end (the bottom), because content moves out from under the bands as it scrolls; a fixed control is seen at both.
 */
async function expectClearOfInsets(page: Page, step: string, insets: Insets, scrolls: boolean): Promise<void> {
  const where = `${step} at ${page.viewportSize()?.width}×${page.viewportSize()?.height}, insets ${JSON.stringify(insets)}`;
  if (!scrolls) {
    expect(await controlsUnderInsets(page, insets, ["top", "bottom", "left", "right"]), where).toEqual([]);
    return;
  }
  await scrollEverything(page, "start");
  expect(await controlsUnderInsets(page, insets, ["top", "left", "right"]), `${where}, scrolled to the top`).toEqual([]);
  await scrollEverything(page, "end");
  expect(await controlsUnderInsets(page, insets, ["bottom", "left", "right"]), `${where}, scrolled to the end`).toEqual([]);
}

const signedIn = { signedIn: true, name: "Ana" };
const friends = { code: "ABC234", friends: [{ id: "f1", name: "Camille", online: true }], requests: [], invites: [] };

interface Screen {
  name: string;
  path: string;
  /** What the page shows, so that the test waits for the screen and not for the network. */
  ready: (page: Page) => Locator;
  table?: () => Snapshot;
  account?: object;
  routes?: Record<string, unknown>;
  /** The page scrolls vertically (everything but a table). */
  scrolls: boolean;
}

const SCREENS: Screen[] = [
  { name: "the home page", path: "/", ready: (p) => p.getByRole("button", { name: /play now/i }), scrolls: true },
  { name: "the setup sheet", path: "/play/bot", ready: (p) => p.locator("label.variant").first(), scrolls: true },
  { name: "the crew tab", path: "/online/private", ready: (p) => p.getByText("Camille"), account: signedIn, routes: { "/api/friends": friends }, scrolls: true },
  { name: "settings", path: "/settings", ready: (p) => p.getByText(/signed in as/i).first(), account: signedIn, scrolls: true },
  {
    name: "the Classic auction",
    path: `/play/bot/bidding/${TABLE_ID}`,
    ready: (p) => p.locator("section.auction"),
    table: () => fixture("classic_auction_round_2"),
    scrolls: false
  },
  {
    name: "mid-trick",
    path: `/online/private/table/${TABLE_ID}`,
    ready: (p) => p.locator(".trick"),
    table: () => fixture("trick_under_review"),
    scrolls: false
  },
  {
    name: "the round result",
    path: `/play/bot/game/${TABLE_ID}`,
    ready: (p) => p.locator("section.result"),
    table: () => fixture("round_over_with_announcements"),
    scrolls: false
  }
];

async function open(page: Page, screen: Screen): Promise<void> {
  await serveApi(page, { table: screen.table?.(), account: screen.account, routes: screen.routes });
  await page.goto(screen.path, { waitUntil: "networkidle" });
  await expect(screen.ready(page).first()).toBeVisible();
}

test.describe("the notch and the home indicator", () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: no control sits under the unsafe areas`, async ({ page }, info) => {
      test.skip(!isPhone(info), "a phone's notch");
      test.skip(!isChromium(info), "only Chromium can emulate the safe-area insets");
      const insets = isPortrait(info) ? NOTCH : LANDSCAPE_NOTCH;
      await setInsets(page, insets);
      await open(page, screen);
      await expectClearOfInsets(page, screen.name, insets, screen.scrolls);
    });
  }

  test("the page declares viewport-fit=cover, so that the insets exist", async ({ page }) => {
    await serveApi(page);
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");
  });

  test("the check itself finds a control under the notch", async ({ page }, info) => {
    test.skip(!isChromium(info), "only Chromium can emulate the safe-area insets");
    await setInsets(page, NOTCH);
    await page.setContent(
      '<meta name="viewport" content="width=device-width, viewport-fit=cover"><button style="position:fixed;top:0;left:0;bottom:auto">under the notch</button>'
    );
    expect(await controlsUnderInsets(page, NOTCH, ["top"])).toHaveLength(1);
  });
});

test.describe("the keyboard", () => {
  /** Opens the keyboard on a field: the field has the focus, the viewport loses 45% of its height, and the browser scrolls the field into view. */
  const fullScreen = new WeakMap<Page, { width: number; height: number }>();
  async function openKeyboard(page: Page, field: Locator): Promise<void> {
    await field.focus();
    // The keyboard takes a share of the screen, not of what is left when it opens a second time (a second field of the same form).
    if (!fullScreen.has(page)) fullScreen.set(page, page.viewportSize()!);
    const view = fullScreen.get(page)!;
    await page.setViewportSize({ width: view.width, height: Math.round(view.height * (1 - KEYBOARD)) });
    await field.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  }

  // 95%: a focused field is drawn a little larger than its box, and WebKit counts the outline, so a field in view can read 97%.
  const inView = (...targets: Locator[]) => Promise.all(targets.map((target) => expect(target).toBeInViewport({ ratio: 0.95 })));

  const upright = (info: TestInfo) => test.skip(!isPhone(info) || !isPortrait(info), "the keyboard of a phone held upright");

  test("the join form: the name field, the code boxes and the Join button stay in view", async ({ page }, info) => {
    upright(info);
    await serveApi(page);
    await page.goto("/online/private", { waitUntil: "networkidle" });
    const name = page.getByLabel("Your name");
    const boxes = page.locator("input.box");
    const join = page.getByRole("button", { name: "Join table" });
    await openKeyboard(page, name);
    await inView(name, join);
    await openKeyboard(page, boxes.first());
    await inView(boxes.first(), boxes.last(), join);
  });

  test("settings: the display-name field and its Save button stay in view", async ({ page }, info) => {
    upright(info);
    await serveApi(page, { account: signedIn });
    await page.goto("/settings", { waitUntil: "networkidle" });
    const field = page.getByLabel(/display name/i).first();
    const save = page.getByRole("button", { name: "Save name" });
    await openKeyboard(page, field);
    await inView(field, save);
  });

  test("the sign-in panel: its buttons stay in view", async ({ page }, info) => {
    upright(info);
    await serveApi(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    // A browser without passkeys (headless WebKit) shows a sentence in their place: there is no button to look at.
    test.skip(!(await page.evaluate(() => Boolean(window.PublicKeyCredential && navigator.credentials))), "this browser has no passkeys");
    const signIn = page.getByRole("button", { name: /sign in with a passkey/i });
    if (!(await signIn.isVisible().catch(() => false)))
      await page
        .getByRole("button", { name: /^sign in/i })
        .first()
        .click();
    await expect(signIn).toBeVisible();
    await openKeyboard(page, signIn);
    await inView(signIn, page.getByRole("button", { name: /create a new account|passkey/i }).last());
  });
});

test.describe("the browser's bars", () => {
  test("the hand and the panel follow when the bars hide and show in the middle of an auction", async ({ page }, info) => {
    test.skip(!isPhone(info), "a phone's address bar");
    const view = size(info);
    await serveApi(page, { table: fixture("classic_auction_round_2") });
    await page.goto(`/play/bot/bidding/${TABLE_ID}`, { waitUntil: "networkidle" });
    await expect(page.locator("section.auction")).toBeVisible();

    const followsTheViewport = async (step: string) => {
      const height = page.viewportSize()!.height;
      await expect(page.locator("section.auction")).toBeVisible();
      await expectLayout(page, step, { ...TABLE, exemptions: [...TABLE.exemptions, ...EXEMPTIONS] });
      for (const part of [page.locator(".hand"), page.locator("section.auction")]) {
        const box = (await part.boundingBox())!;
        expect(box.y, `${step}: the top of a part is on the screen`).toBeGreaterThanOrEqual(-1);
        expect(box.y + box.height, `${step}: the bottom of a part is above the ${height}px bottom edge`).toBeLessThanOrEqual(height + 1);
      }
    };

    await followsTheViewport("bars shown");
    for (let round = 0; round < 2; round++) {
      // Scrolling down hides the bars: the page is 56 px taller.
      await page.setViewportSize({ width: view.width, height: view.height + BARS });
      await followsTheViewport("bars hidden");
      // Scrolling up shows them again.
      await page.setViewportSize(view);
      await followsTheViewport("bars shown again");
    }
  });
});

test.describe("turning the phone", () => {
  /** What the table holds, as a player reads it: the cards of the hand, the cards of the trick and the page's address. */
  const state = (page: Page) =>
    page.evaluate(() => ({
      path: location.pathname,
      hand: [...document.querySelectorAll(".hand button, .hand [role='button']")].map((card) => card.getAttribute("aria-label") ?? card.textContent?.trim() ?? ""),
      trick: document.querySelector(".trick")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      scores: document.querySelector(".scoreboard, .scores, header")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
    }));

  test("the table keeps its state and its layout from portrait to landscape and back, in the middle of a trick", async ({ page }, info) => {
    test.skip(!isPhone(info), "a phone");
    const view = size(info);
    await serveApi(page, { table: fixture("trick_under_review") });
    await page.goto(`/online/private/table/${TABLE_ID}`, { waitUntil: "networkidle" });
    await expect(page.locator(".trick")).toBeVisible();
    await expect(page.locator(".hand")).toBeVisible();
    await expectLayout(page, "before turning", TABLE);
    const before = await state(page);
    expect(before.hand.length, "the hand has cards").toBeGreaterThan(0);

    await page.setViewportSize({ width: view.height, height: view.width });
    await expect(page.locator(".hand")).toBeVisible();
    await expectLayout(page, "turned", TABLE);
    expect(await state(page), "the state turned").toEqual(before);

    await page.setViewportSize(view);
    await expect(page.locator(".hand")).toBeVisible();
    await expectLayout(page, "turned back", TABLE);
    expect(await state(page), "the state turned back").toEqual(before);
  });
});
