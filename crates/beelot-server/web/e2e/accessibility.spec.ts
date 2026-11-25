// Accessibility on every size (US-207), on the key screens of US-201 and US-205 served from recorded snapshots (screens.ts):
//   axe        no violation of WCAG 2.2 level AA, except the exemptions written here with their reason;
//   keyboard   Tab reaches every control in order with a visible focus inside the viewport, and a dialog traps the focus;
//   media      prefers-reduced-motion, forced-colors and prefers-contrast;
//   rotation   the page never locks the orientation or asks to rotate.
// It runs on the four sizes of devices.ts that say `accessibility`, in Chromium.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectLayout } from "./layout";
import { SHOW } from "./screens";
import { SCREENS } from "./screenshot-list";
import { TABLE } from "./table-layout";

/** Rules that axe may not apply to an element, each with the reason that makes it right. */
interface AxeExemption {
  rule: string;
  /** The elements it excuses (a CSS selector axe reports in the node's target). */
  selector: string;
  reason: string;
}
const AXE_EXEMPTIONS: AxeExemption[] = [];

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Screen = (typeof SCREENS)[number];
/** The screens that are tables: their page does not scroll, like the layout checks say. */
const TABLES: Screen[] = ["auction", "mid-trick", "round-result", "match-end"];
const layoutOf = (screen: Screen) => (TABLES.includes(screen) ? TABLE : {});

async function violationsOf(page: Page, options: { tags?: string[]; rules?: string[] } = {}): Promise<string[]> {
  let builder = new AxeBuilder({ page });
  builder = options.rules ? builder.withRules(options.rules) : builder.withTags(options.tags ?? WCAG_AA);
  const { violations } = await builder.analyze();
  const found: string[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const target = node.target.join(" ");
      const exempt = AXE_EXEMPTIONS.some((e) => e.rule === violation.id && (target.includes(e.selector) || node.html.includes(e.selector)));
      if (!exempt) found.push(`${violation.id}: ${target} — ${node.failureSummary?.replace(/\s+/g, " ").trim()} (${violation.helpUrl})`);
    }
  }
  return found;
}

const size = (page: Page) => `${page.viewportSize()?.width}×${page.viewportSize()?.height}`;

test.describe("axe, WCAG 2.2 level AA", () => {
  for (const screen of SCREENS) {
    test(`the ${screen.replace("-", " ")}`, async ({ page }) => {
      await SHOW[screen](page);
      expect(await violationsOf(page), `the ${screen} at ${size(page)}`).toEqual([]);
    });
  }

  test("the setup sheet opened from the home screen", async ({ page }) => {
    await SHOW.home(page);
    await page.getByRole("button", { name: /play now/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await violationsOf(page), `the setup sheet at ${size(page)}`).toEqual([]);
  });

  test("the round review", async ({ page }) => {
    await SHOW["round-result"](page);
    await page
      .locator("section.result")
      .getByRole("button", { name: /review round/i })
      .click();
    await expect(page.getByRole("dialog", { name: /review round/i })).toBeVisible();
    expect(await violationsOf(page), `the round review at ${size(page)}`).toEqual([]);
  });

  test("the check can fail: a button with no name is found", async ({ page }) => {
    await SHOW.home(page);
    await page.evaluate(() => document.body.append(Object.assign(document.createElement("button"), { id: "nameless" })));
    const found = await violationsOf(page, { rules: ["button-name"] });
    expect(found.join("\n")).toContain("#nameless");
  });
});

// --------------------------------------------------------------------------------------------------------------- keyboard

interface Stop {
  /** The element's role and name, for a message. */
  label: string;
  inside: boolean;
  /** Where it is, for a message. */
  rect: string;
  visible: boolean;
  indicator: boolean;
  /** Its position in the document: an increasing order is the reading order. */
  order: number;
  tabindex: number;
  id: number;
}

// Runs in the page: marks the element that has the focus and describes it.
function describeFocus(): Stop | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const name = el.getAttribute("aria-label") || (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || el.getAttribute("placeholder") || el.id;
  const all = Array.from(document.querySelectorAll("*"));
  const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
  const ring = style.boxShadow !== "none";
  return {
    label: `${el.getAttribute("role") ?? el.tagName.toLowerCase()} "${name}"`,
    rect: `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}×${Math.round(rect.height)} in ${width}×${height}`,
    inside: rect.left >= -2 && rect.top >= -2 && rect.right <= width + 2 && rect.bottom <= height + 2,
    visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden",
    indicator: el.matches(":focus-visible") && (outline || ring),
    order: all.indexOf(el),
    tabindex: el.tabIndex,
    id: all.indexOf(el)
  };
}

/**
 * The controls the keyboard can reach: what is shown, not inert, and not the other buttons of a radio group. With a modal open,
 * those of the modal. `focusFirst` gives the focus to the first of them (the keyboard's own starting point is not reliable in a
 * dialog), and either way the answer is how many there are.
 */
function tabbableControls(args: { focusFirst?: boolean; root?: string }): number {
  const scope = args.root
    ? document.querySelector(args.root)
    : (document.querySelector("dialog:modal") ?? document.querySelector('[role="dialog"][aria-modal="true"]') ?? document);
  if (!scope) return 0;
  const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
  const seen = new Set<string>();
  let count = 0;
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>(selector))) {
    if (el.tabIndex < 0 || (el as HTMLInputElement).disabled || !el.checkVisibility({ checkVisibilityCSS: true }) || el.closest("[inert]")) continue;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      // A radio group is one stop: the keys move inside it.
      const key = `${el.form?.id ?? ""}/${el.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (count === 0 && args.focusFirst) el.focus();
    count++;
  }
  return count;
}

/**
 * Waits until what moves has stopped: the skip link slides in when it takes the focus, and the browser scrolls a focused control
 * into view (smoothly, in a row of chips), so its place is judged where it settles.
 */
const settled = (page: Page) =>
  page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number))
        .map((a) => a.finished.catch(() => null))
    );
    const place = () => JSON.stringify(document.activeElement?.getBoundingClientRect());
    let last = place();
    let still = 0;
    for (let frame = 0; frame < 60 && still < 4; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = place();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });

/** Gives the focus to the first control, then presses Tab until the focus comes round, and describes each stop. */
async function tabThrough(page: Page, limit = 120): Promise<Stop[]> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(tabbableControls, { focusFirst: true });
  await settled(page);
  const first = await page.evaluate(describeFocus);
  const stops: Stop[] = first ? [first] : [];
  for (let press = 0; press < limit && first; press++) {
    await page.keyboard.press("Tab");
    await settled(page);
    const stop = await page.evaluate(describeFocus);
    // The focus went to the browser's own bars (the body): the next Tab brings it back.
    if (!stop) continue;
    if (stop.id === first.id) break;
    stops.push(stop);
  }
  return stops;
}

test.describe("keyboard", () => {
  for (const screen of SCREENS) {
    test(`Tab reaches every control of the ${screen.replace("-", " ")} in order, with a visible focus`, async ({ page }) => {
      await SHOW[screen](page);
      // A modal dialog (the match end) makes the page behind inert: only its own controls are tabbable.
      const stops = await tabThrough(page);
      const where = `the ${screen} at ${size(page)}`;
      expect(stops.length, `${where} has controls to reach`).toBeGreaterThan(0);
      expect(stops.length, `${where}: Tab went round`).toBeLessThan(120);
      const bad = (what: string, pick: (stop: Stop) => boolean) => stops.filter((stop) => !pick(stop)).map((stop) => `${what}: ${stop.label}`);
      expect(
        [
          ...bad("hidden", (s) => s.visible),
          ...stops.filter((s) => !s.inside).map((s) => `outside the viewport: ${s.label} at ${s.rect}`),
          ...bad("no visible focus indicator", (s) => s.indicator),
          ...bad("a positive tabindex", (s) => s.tabindex <= 0)
        ],
        where
      ).toEqual([]);
      // The reading order: each stop comes after the one before it in the document (the dialogs are moved to the end of <body>).
      const orders = stops.map((s) => s.order);
      expect(orders, `${where}: the order of Tab is the order of the page`).toEqual([...orders].sort((a, b) => a - b));
      // Every control is reached.
      const expected = await page.evaluate(tabbableControls, {});
      expect(stops.length, `${where}: ${stops.map((s) => s.label).join(", ")}`).toBeGreaterThanOrEqual(expected);
    });
  }

  test("an open sheet traps the focus and gives it back when it closes", async ({ page }) => {
    await SHOW.home(page);
    const opener = page.getByRole("button", { name: /play now/i });
    await opener.focus();
    await opener.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const stops = await dialog.evaluate((el) => {
      const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';
      return Array.from(el.querySelectorAll<HTMLElement>(selector)).filter((c) => c.tabIndex >= 0 && !(c as HTMLInputElement).disabled && c.checkVisibility()).length;
    });
    expect(stops, "the sheet has controls").toBeGreaterThan(1);
    // Past its last control a native dialog hands the focus to the browser's own bars (the body here), never to the page behind.
    const inside = () => page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest("dialog[open]"));
    // Tab through the sheet twice over, then back with Shift+Tab: the focus never leaves it.
    for (let press = 0; press < stops * 2 + 2; press++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab ${press + 1} of ${stops * 2 + 2} stays in the sheet at ${size(page)}`).toBe(true);
    }
    for (let press = 0; press < stops + 2; press++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${press + 1} stays in the sheet at ${size(page)}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener, "the focus is back on the button that opened the sheet").toBeFocused();
  });

  test("a dialog of the table traps the focus and gives it back when it closes", async ({ page }) => {
    await SHOW["round-result"](page);
    const opener = page.locator("section.result").getByRole("button", { name: /review round/i });
    await opener.focus();
    await opener.press("Enter");
    const dialog = page.getByRole("dialog", { name: /review round/i });
    await expect(dialog).toBeVisible();
    const stops = await page.evaluate(tabbableControls, { root: '[role="dialog"]' });
    expect(stops).toBeGreaterThan(0);
    for (let press = 0; press < stops * 2 + 2; press++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('[role="dialog"]')),
        `Tab ${press + 1} stays in the review at ${size(page)}`
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener, "the focus is back on the button that opened the review").toBeFocused();
  });
});

// ------------------------------------------------------------------------------------------------------- media settings

// What moves a control: a property that changes where or how big it is. A fade does not.
const MOVING = /^(transform|translate|rotate|scale|top|left|right|bottom|inset|margin|width|height)/i;

/** Before the page loads: records every animation and transition that starts and moves a control. */
async function recordMotion(page: Page) {
  await page.addInitScript((pattern) => {
    const moving = new RegExp(pattern, "i");
    const log: string[] = [];
    (window as unknown as { __moves: string[] }).__moves = log;
    const CONTROL = 'a[href], button, input, select, textarea, summary, [role="button"], [role="switch"], [tabindex]';
    // It moves a control when its target is one, holds one or sits inside one: a decorative loop around the table does not.
    const touchesControl = (el: Element) => !!(el.closest(CONTROL) || el.querySelector(CONTROL));
    const describeEl = (el: Element) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : ""}`;
    // A property moves when its value changes along the keyframes ("none" to "none" is a fade that names the property).
    const movesIn = (frames: Record<string, unknown>[]): string[] => {
      const values = new Map<string, Set<string>>();
      for (const frame of frames)
        for (const [name, value] of Object.entries(frame)) {
          if (!moving.test(name) || value === undefined || value === null) continue;
          if (!values.has(name)) values.set(name, new Set());
          values.get(name)?.add(String(value).replace(/\s+/g, ""));
        }
      return [...values].filter(([, set]) => set.size > 1).map(([name]) => name);
    };
    const asFrames = (keyframes: Keyframe[] | PropertyIndexedKeyframes | null): Record<string, unknown>[] => {
      if (Array.isArray(keyframes)) return keyframes as Record<string, unknown>[];
      return Object.entries(keyframes ?? {}).flatMap(([name, list]) => (Array.isArray(list) ? list : [list]).map((value) => ({ [name]: value })));
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const duration = typeof options === "number" ? options : (options?.duration as number | undefined);
      const hit = movesIn(asFrames(keyframes));
      if (hit.length > 0 && (duration === undefined || duration > 1) && touchesControl(this)) log.push(`animate(${hit.join(",")}, ${duration}ms) on ${describeEl(this)}`);
      return animate.call(this, keyframes, options);
    };
    document.addEventListener(
      "animationstart",
      (event) => {
        const target = event.target as Element;
        for (const animation of target.getAnimations()) {
          const effect = animation.effect as KeyframeEffect | null;
          if ((animation as CSSAnimation).animationName !== event.animationName || !effect) continue;
          const timing = effect.getComputedTiming();
          const hit = movesIn(effect.getKeyframes() as unknown as Record<string, unknown>[]);
          if (hit.length > 0 && Number(timing.duration) > 1 && touchesControl(target))
            log.push(`animation ${event.animationName} (${hit.join(",")}, ${Math.round(Number(timing.duration))}ms) on ${describeEl(target)}`);
        }
      },
      true
    );
    document.addEventListener("transitionstart", (event) => {
      const e = event as TransitionEvent;
      const duration = getComputedStyle(e.target as Element).transitionDuration;
      if (moving.test(e.propertyName) && touchesControl(e.target as Element) && Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000) > 1)
        log.push(`transition ${e.propertyName} (${duration}) on ${describeEl(e.target as Element)}`);
    });
  }, MOVING.source);
}

const motionOf = (page: Page) => page.evaluate(() => (window as unknown as { __moves?: string[] }).__moves ?? []);

test.describe("prefers-reduced-motion: reduce", () => {
  test.beforeEach(async ({ page, context }) => {
    // The fixtures turn the page's effects off so that a screen is measured where it settles. Here the player has chosen
    // nothing, and the system asks for less motion.
    await context.addInitScript(() => {
      try {
        localStorage.removeItem("beelot.effects");
      } catch {
        /* blocked storage: nothing to remove */
      }
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordMotion(page);
  });

  for (const screen of SCREENS) {
    test(`nothing moves a control on the ${screen.replace("-", " ")}`, async ({ page }) => {
      await SHOW[screen](page);
      await page.waitForTimeout(800);
      expect(await motionOf(page), `the ${screen} at ${size(page)}`).toEqual([]);
    });
  }

  test("nothing moves when the setup sheet and the round review open and close", async ({ page }) => {
    await SHOW.home(page);
    await page.getByRole("button", { name: /play now/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await SHOW["round-result"](page);
    await page
      .locator("section.result")
      .getByRole("button", { name: /review round/i })
      .click();
    await expect(page.getByRole("dialog", { name: /review round/i })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await motionOf(page), `at ${size(page)}`).toEqual([]);
  });

  test("the check can fail: a moving animation is recorded", async ({ page }) => {
    await SHOW.home(page);
    await page.evaluate(() => document.body.animate([{ transform: "none" }, { transform: "translateY(8px)" }], { duration: 300 }));
    expect((await motionOf(page)).join()).toContain("animate(transform");
  });

  test("a choice of the player still wins over the system", async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem("beelot.effects", "full"));
    await SHOW.home(page);
    expect(await page.evaluate(() => document.documentElement.dataset.effects)).toBe("full");
  });
});

test.describe("forced-colors: active", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  for (const screen of SCREENS) {
    test(`the ${screen.replace("-", " ")} keeps its layout, its edges and its focus`, async ({ page }) => {
      await SHOW[screen](page);
      expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches), "the setting is on").toBe(true);
      await expectLayout(page, `the ${screen} in forced colours`, layoutOf(screen));
      // The browser drops backgrounds and shadows: a button or a field with no border and no outline is text with no shape.
      const shapeless = await page.evaluate(() => {
        const found: string[] = [];
        for (const control of Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input:not([type="hidden"]), select, textarea'))) {
          if (!control.checkVisibility({ checkVisibilityCSS: true }) || control.closest("[inert]")) continue;
          // A radio or a box that is hidden behind a card is judged by its card, the label around it.
          const hidden = control.getBoundingClientRect().width < 10 || getComputedStyle(control).opacity === "0";
          const el = hidden ? (control.closest("label") ?? control) : control;
          const style = getComputedStyle(el);
          const edge = ["Top", "Right", "Bottom", "Left"].some((side) => {
            const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
            return kind !== "none" && kind !== "hidden" && Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0;
          });
          const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
          // A button that is only an icon in a group (a card of the hand) is judged by its card's own edge.
          if (!edge && !outline)
            found.push(`${el.getAttribute("role") ?? el.tagName.toLowerCase()} "${el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 30)}"`);
        }
        return found;
      });
      expect(shapeless, `the ${screen} at ${size(page)}: a control with no edge`).toEqual([]);
      const stops = await tabThrough(page, 60);
      expect(
        stops.filter((s) => !s.indicator).map((s) => s.label),
        `the ${screen} at ${size(page)}: focus drawn in forced colours`
      ).toEqual([]);
    });
  }
});

test.describe("prefers-contrast: more", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ contrast: "more" });
  });

  for (const screen of SCREENS) {
    test(`the ${screen.replace("-", " ")} reaches the enhanced contrast of 7:1`, async ({ page }) => {
      await SHOW[screen](page);
      expect(await page.evaluate(() => matchMedia("(prefers-contrast: more)").matches), "the setting is on").toBe(true);
      expect(await violationsOf(page, { rules: ["color-contrast-enhanced"] }), `the ${screen} at ${size(page)}`).toEqual([]);
    });
  }
});

// ------------------------------------------------------------------------------------------------------------ orientation

test.describe("orientation", () => {
  for (const screen of SCREENS) {
    test(`the ${screen.replace("-", " ")} never locks the orientation or asks to rotate`, async ({ page }) => {
      await page.addInitScript(() => {
        const calls: string[] = [];
        (window as unknown as { __locks: string[] }).__locks = calls;
        const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
        if (orientation) orientation.lock = (type: string) => (calls.push(type), Promise.resolve());
      });
      await SHOW[screen](page);
      const { locks, text } = await page.evaluate(() => ({ locks: (window as unknown as { __locks: string[] }).__locks, text: document.body.textContent ?? "" }));
      expect(locks, `the ${screen} at ${size(page)} calls screen.orientation.lock`).toEqual([]);
      expect(text, `the ${screen} at ${size(page)} asks to rotate`).not.toMatch(
        /\b(rotate|turn) (your|the) (phone|device|screen|tablet)|\b(landscape|portrait) (mode|only)|\bplease (rotate|turn)/i
      );
    });
  }
});
