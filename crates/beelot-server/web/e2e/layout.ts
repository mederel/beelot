// The layout checks (US-201): four invariants asserted on the page as it is, after each step of a scripted flow, so that a
// control pushed off the screen or hidden under another one fails a pull request before a player sees it.
//
//   scroll   no horizontal scroll, and no element wider than the viewport;
//   clipped  every visible button, link, input and card of the hand is inside the viewport, or inside a scrollable container
//            made for it, and is not cut by an ancestor that hides its overflow;
//   overlap  the hand does not cover the auction panel, the played cards or the scores, and no two interactive elements cover
//            each other, except an overlay and the page below it (and the cards of a hand, which overlap by design);
//   touch    on a touch profile every interactive element is at least 44×44 CSS pixels.
//
// A failure names the element (its role and its name), the invariant and the numbers. An exemption is written in the test that
// needs it, with its reason: `{ selector, invariant, reason }` skips the elements the selector matches for that invariant.
import { expect, type Page } from "@playwright/test";

export type Invariant = "scroll" | "clipped" | "overlap" | "touch";

export interface Exemption {
  /** The elements it exempts (a CSS selector). */
  selector: string;
  /** The invariant they are exempt from, or every one. */
  invariant: Invariant | "*";
  /** Only on screens narrower than this many CSS pixels: an exemption for the smallest phones does not excuse the others. */
  below?: number;
  /** Why the layout is right as it is: a reader of the test must be able to judge it. */
  reason: string;
}

export interface LayoutOptions {
  /** Elements that are allowed to break an invariant, each with its reason. */
  exemptions?: Exemption[];
  /** The page scrolls vertically (every page but the table): content below the fold is not clipped. Default true. */
  pageScrolls?: boolean;
}

export interface Violation {
  invariant: Invariant;
  /** The element's role and name, e.g. `button "Pass"`. */
  element: string;
  /** What is wrong, with the numbers. */
  detail: string;
}

export const TOUCH_TARGET = 44;

/** What every page has and no test needs to repeat: the skip link waits above the page until the keyboard focuses it. */
export const STANDING_EXEMPTIONS: Exemption[] = [{ selector: "a.skip", invariant: "clipped", reason: "the skip link waits above the page until the keyboard focuses it" }];

/** Every box, in CSS pixels, that is drawn: the message of a failure quotes them rounded. */
export function describe(violation: Violation): string {
  return `${violation.invariant}: ${violation.element} — ${violation.detail}`;
}

// Runs in the page: no reference to this module's scope. Returns the violations it finds.
function measure(args: { exemptions: Exemption[]; pageScrolls: boolean; touchTarget: number }): Violation[] {
  const { exemptions, pageScrolls, touchTarget } = args;
  const violations: Violation[] = [];
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const TOLERANCE = 1;
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  const box = (r: DOMRect) => `${px(r.width)}×${px(r.height)} at (${px(r.left)}, ${px(r.top)})`;

  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      return type === "checkbox" || type === "radio" ? type : type === "submit" || type === "button" ? "button" : "textbox";
    }
    if (tag === "textarea") return "textbox";
    return tag;
  };
  const nameOf = (el: Element): string => {
    const labelled = el.getAttribute("aria-labelledby");
    const byId = labelled
      ? labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
      : "";
    const raw =
      el.getAttribute("aria-label") ||
      byId ||
      (el as HTMLInputElement).labels?.[0]?.textContent ||
      (el.textContent ?? "") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("alt") ||
      (el as HTMLInputElement).value ||
      "";
    const name = raw.replace(/\s+/g, " ").trim();
    return name.length > 40 ? `${name.slice(0, 37)}…` : name;
  };
  const label = (el: Element): string => {
    const name = nameOf(el);
    const hint = el.id
      ? `#${el.id}`
      : typeof (el as HTMLElement).className === "string" && (el as HTMLElement).className
        ? `.${(el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : el.tagName.toLowerCase();
    return `${roleOf(el)} ${name ? `"${name}"` : "(no name)"} [${hint}]`;
  };

  const exempt = (el: Element, invariant: Invariant): boolean =>
    exemptions.some((rule) => (rule.invariant === "*" || rule.invariant === invariant) && (rule.below === undefined || width < rule.below) && el.closest(rule.selector) !== null);

  // Drawn: a box, shown, not made invisible, not a screen-reader-only 1px box, and not inside what is hidden from everyone.
  const drawn = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    return el.closest('[aria-hidden="true"], [inert], [hidden]') === null;
  };

  const overflowOf = (el: Element) => {
    const style = getComputedStyle(el);
    return { x: style.overflowX, y: style.overflowY };
  };
  const scrollsX = (el: Element) => /auto|scroll/.test(overflowOf(el).x) && el.scrollWidth > el.clientWidth + TOLERANCE;
  const scrollsY = (el: Element) => /auto|scroll/.test(overflowOf(el).y) && el.scrollHeight > el.clientHeight + TOLERANCE;
  // The scrollable containers around an element, from the nearest to the farthest (the page itself is not one of them).
  const scrollers = (el: Element): Element[] => {
    const found: Element[] = [];
    for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
      if (scrollsX(up) || scrollsY(up)) found.push(up);
    }
    return found;
  };
  const fixedAncestor = (el: Element): boolean => {
    for (let up: Element | null = el; up && up !== document.documentElement; up = up.parentElement) {
      if (getComputedStyle(up).position === "fixed") return true;
    }
    return false;
  };

  // An open dialog is an overlay: the page below it is dimmed and inert, so only what is in the dialog is judged.
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')).filter(drawn);
  const behindDialog = (el: Element) => dialogs.length > 0 && !dialogs.some((dialog) => dialog.contains(el));

  const interactive = Array.from(
    document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="link"], [role="checkbox"], [tabindex]:not([tabindex="-1"]), .hand-card'
    )
  ).filter((el) => drawn(el) && !behindDialog(el));

  // 1. No horizontal scroll.
  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > width + TOLERANCE && !exemptions.some((rule) => rule.invariant !== "touch" && rule.selector === "html")) {
    // Name the widest element that sticks out, so that the log says what to fix.
    let widest: { el: Element; right: number } | null = null;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!drawn(el) || scrollers(el).length) continue;
      const right = el.getBoundingClientRect().right;
      if (right > width + TOLERANCE && (!widest || right > widest.right)) widest = { el, right };
    }
    violations.push({
      invariant: "scroll",
      element: widest ? label(widest.el) : "the page",
      detail: `the page scrolls sideways: scrollWidth ${scrollWidth}px > clientWidth ${width}px${widest ? `, its right edge is at ${px(widest.right)}` : ""}`
    });
  }
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (!drawn(el) || exempt(el, "scroll") || scrollers(el).length) continue;
    // A box inside an ancestor that hides its overflow is cut there, not wider than the viewport: the clip check judges it.
    let cut = false;
    for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      if (/hidden|clip/.test(overflowOf(up).x) && up.getBoundingClientRect().width <= width + TOLERANCE) cut = true;
    }
    if (cut) continue;
    const r = el.getBoundingClientRect();
    if (r.width > width + TOLERANCE) {
      violations.push({ invariant: "scroll", element: label(el), detail: `${px(r.width)} wide, wider than the ${width}px viewport` });
    }
  }

  // 2. Nothing important is clipped.
  for (const el of interactive) {
    if (exempt(el, "clipped")) continue;
    const r = el.getBoundingClientRect();
    const fixed = fixedAncestor(el);
    const nearest = scrollers(el)[0];
    const problems: string[] = [];
    // The viewport: the sides always, the bottom unless the page scrolls (a fixed bar does not scroll with it).
    const beyondSide = r.left < -TOLERANCE || r.right > width + TOLERANCE;
    const beyondTop = r.top < -TOLERANCE && (fixed || !pageScrolls);
    const beyondBottom = r.bottom > height + TOLERANCE && (fixed || !pageScrolls);
    const beyondPageBottom = r.bottom > height + TOLERANCE && pageScrolls && !fixed && document.documentElement.scrollHeight <= height + TOLERANCE;
    if (!nearest && (beyondSide || beyondTop || beyondBottom || beyondPageBottom)) {
      problems.push(`${box(r)} is outside the ${width}×${height} viewport`);
    }
    if (nearest) {
      // Made for it: the container scrolls, but the container itself must be on screen.
      const c = nearest.getBoundingClientRect();
      const containerOut = c.left < -TOLERANCE || c.right > width + TOLERANCE || (!pageScrolls && (c.top < -TOLERANCE || c.bottom > height + TOLERANCE));
      if (containerOut) problems.push(`its scrollable container ${label(nearest)} (${box(c)}) is outside the ${width}×${height} viewport`);
    }
    // An ancestor that hides its overflow cuts the part of the element beyond its edge. A scrollable container on the way is a
    // window onto its content: what is beyond its edge is reached by scrolling, and the window itself is judged from there.
    let seen = r;
    for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      const overflow = overflowOf(up);
      if (scrollsX(up) || scrollsY(up)) {
        seen = up.getBoundingClientRect();
        continue;
      }
      if (!/hidden|clip/.test(overflow.x + overflow.y)) continue;
      const c = up.getBoundingClientRect();
      const cutX = /hidden|clip/.test(overflow.x) && (seen.left < c.left - TOLERANCE || seen.right > c.right + TOLERANCE);
      const cutY = /hidden|clip/.test(overflow.y) && (seen.top < c.top - TOLERANCE || seen.bottom > c.bottom + TOLERANCE);
      if (cutX || cutY) {
        problems.push(`${box(seen)} is cut by ${label(up)} (${box(c)}), which hides its overflow`);
        break;
      }
    }
    for (const detail of problems) violations.push({ invariant: "clipped", element: label(el), detail });
  }

  // 3. Nothing overlaps.
  // The dialogs and the panels that come over the table (the auction, the lobby, the round result) are overlays.
  const modal = (el: Element) => el.closest('[role="dialog"], [aria-modal="true"], dialog, section.auction, section.lobby, section.result');
  const regions: [string, string][] = [
    ["the hand", ".hand"],
    ["the auction panel", "section.auction"],
    ["the played cards", ".trick"],
    ["the scores", ".scores"]
  ];
  const found = regions.map(([name, selector]) => {
    const el = Array.from(document.querySelectorAll(selector)).find(drawn);
    return { name, el: el ?? null, rect: el?.getBoundingClientRect() ?? null };
  });
  const hand = found[0];
  for (const other of found.slice(1)) {
    if (!hand.el || !other.el || !hand.rect || !other.rect || exempt(hand.el, "overlap") || exempt(other.el, "overlap")) continue;
    const across = Math.min(hand.rect.right, other.rect.right) - Math.max(hand.rect.left, other.rect.left);
    const down = Math.min(hand.rect.bottom, other.rect.bottom) - Math.max(hand.rect.top, other.rect.top);
    if (across > TOLERANCE && down > TOLERANCE) {
      violations.push({
        invariant: "overlap",
        element: `${hand.name} [.hand]`,
        detail: `covers ${other.name}: ${box(hand.rect)} meets ${box(other.rect)}, ${px(across)}×${px(down)} in common`
      });
    }
  }
  const inHand = (el: Element) => el.closest(".hand") !== null;
  // What of an element can be seen: its box cut by the windows of the scrollable and clipping containers around it. A button
  // that waits below the fold of a scrolling panel covers nothing until the panel is scrolled to it.
  const visibleRect = (el: Element): DOMRect | null => {
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    for (let up = el.parentElement; up && up !== document.documentElement && up !== document.body; up = up.parentElement) {
      const overflow = overflowOf(up);
      if (overflow.x === "visible" && overflow.y === "visible") continue;
      const c = up.getBoundingClientRect();
      if (overflow.x !== "visible") {
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
      }
      if (overflow.y !== "visible") {
        top = Math.max(top, c.top);
        bottom = Math.min(bottom, c.bottom);
      }
    }
    return right - left > 0 && bottom - top > 0 ? new DOMRect(left, top, right - left, bottom - top) : null;
  };
  // A bar fixed to the screen (the tabs) covers the page that scrolls under it. What is under it now is not covered if the page
  // can scroll it clear: below the bar when the page is at its end, or above it when it is at its start.
  const fixedRoot = (el: Element): Element | null => {
    for (let up: Element | null = el; up && up !== document.documentElement; up = up.parentElement) {
      if (/fixed|sticky/.test(getComputedStyle(up).position)) return up;
    }
    return null;
  };
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - height);
  const scrollsClear = (flow: Element, bar: Element): boolean => {
    if (!pageScrolls || maxScroll <= 0 || fixedRoot(flow)) return false;
    const f = bar.getBoundingClientRect();
    const r = flow.getBoundingClientRect();
    const docTop = r.top + window.scrollY;
    const docBottom = r.bottom + window.scrollY;
    return docBottom - f.top <= maxScroll + TOLERANCE || docTop - f.bottom >= -TOLERANCE;
  };
  const coveredByBar = (a: Element, b: Element): boolean => {
    const fa = fixedRoot(a);
    const fb = fixedRoot(b);
    if (fa && !fb) return scrollsClear(b, fa);
    if (fb && !fa) return scrollsClear(a, fb);
    return false;
  };
  for (let i = 0; i < interactive.length; i++) {
    const a = interactive[i];
    if (exempt(a, "overlap")) continue;
    const ra = visibleRect(a);
    if (!ra) continue;
    for (let j = i + 1; j < interactive.length; j++) {
      const b = interactive[j];
      if (exempt(b, "overlap") || a.contains(b) || b.contains(a)) continue;
      if (inHand(a) && inHand(b)) continue; // the cards of a hand overlap, each over the one before it
      if (modal(a) !== modal(b)) continue; // an overlay and the page below it
      if (coveredByBar(a, b)) continue; // a fixed bar and the page that scrolls under it
      // Two controls of one label (an input and its text) are one target.
      const ia = a as HTMLInputElement;
      const ib = b as HTMLInputElement;
      if (Array.from(ia.labels ?? []).some((l) => l.contains(b)) || Array.from(ib.labels ?? []).some((l) => l.contains(a))) continue;
      const rb = visibleRect(b);
      if (!rb) continue;
      const across = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const down = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (across > 2 && down > 2) {
        violations.push({
          invariant: "overlap",
          element: label(a),
          detail: `covers ${label(b)}: ${box(ra)} meets ${box(rb)}, ${px(across)}×${px(down)} in common`
        });
      }
    }
    // The point at the middle of what is on screen must reach the element, not another one over it.
    const cx = Math.min(Math.max(ra.left, 0), width) + (Math.min(ra.right, width) - Math.min(Math.max(ra.left, 0), width)) / 2;
    const cy = Math.min(Math.max(ra.top, 0), height) + (Math.min(ra.bottom, height) - Math.min(Math.max(ra.top, 0), height)) / 2;
    if (cx <= 0 || cy <= 0 || cx >= width || cy >= height || inHand(a)) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || a.contains(hit) || hit.contains(a)) continue;
    if (Array.from((a as HTMLInputElement).labels ?? []).some((l) => l.contains(hit))) continue;
    if (modal(hit) && !modal(a)) continue; // an overlay over the page below it
    const bar = fixedRoot(hit);
    if (bar && !fixedRoot(a) && scrollsClear(a, bar)) continue; // a fixed bar over the page that scrolls under it
    if (hit.closest("[data-layout-overlay]")) continue;
    const coverer = hit.closest("button, a[href], input, select, textarea, [role]") ?? hit;
    violations.push({ invariant: "overlap", element: label(a), detail: `is covered at its middle (${px(cx)}, ${px(cy)}) by ${label(coverer)}` });
  }

  // 4. Touch targets.
  if (matchMedia("(pointer: coarse)").matches) {
    for (const el of interactive) {
      if (exempt(el, "touch")) continue;
      const r = el.getBoundingClientRect();
      // A card of the hand overlaps the next ones: its target is the strip that shows, so only its height is judged.
      if (el.matches(".hand-card")) {
        if (r.height + TOLERANCE < touchTarget) violations.push({ invariant: "touch", element: label(el), detail: `${px(r.height)} tall, under the ${touchTarget}px target` });
      } else if (r.width + TOLERANCE < touchTarget || r.height + TOLERANCE < touchTarget) {
        violations.push({ invariant: "touch", element: label(el), detail: `${px(r.width)}×${px(r.height)}, under ${touchTarget}×${touchTarget}px` });
      }
    }
  }
  return violations;
}

/**
 * The animations that end are let to end, so that a panel is measured where it settles and not on its way in. A sheet starts
 * its animation a few frames after the route shows it: the page must stay free of running animations for 200 ms in a row.
 *
 * Time alone is not enough in WebKit (ci run 45548060433: the private table's lobby on iphone-390-webkit): an animation waits for its
 * first frame as "pending", not "running", and a page that is not in front (the guest's, in a second context) may paint no frame
 * for 200 ms. The lobby was then measured on the first frame of its fly-in, 200 px below its place. So the page is brought to
 * the front, two frames are waited for, and a pending animation counts as one that runs.
 */
async function settle(page: Page): Promise<void> {
  await page.bringToFront().catch(() => undefined);
  await page
    .evaluate(async () => {
      const active = () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && (a.pending || a.playState === "running"));
      // A frame, or half a second when none is painted: the wait must end even in a page that never paints.
      const frame = () => Promise.race([new Promise((done) => requestAnimationFrame(done)), new Promise((done) => setTimeout(done, 500))]);
      const deadline = performance.now() + 3000;
      await frame();
      await frame();
      let idle = 0;
      while (idle < 4 && performance.now() < deadline) {
        if (active().length) idle = 0;
        else idle++;
        await new Promise((done) => setTimeout(done, 50));
        await frame();
      }
    })
    .catch(() => undefined);
}

export async function findLayoutViolations(page: Page, options: LayoutOptions = {}): Promise<Violation[]> {
  await settle(page);
  return page.evaluate(measure, { exemptions: [...STANDING_EXEMPTIONS, ...(options.exemptions ?? [])], pageScrolls: options.pageScrolls ?? true, touchTarget: TOUCH_TARGET });
}

/** Fails, naming each element, invariant and number, when the page in its current state breaks one of the four invariants. */
export async function expectLayout(page: Page, step: string, options: LayoutOptions = {}): Promise<void> {
  const violations = await findLayoutViolations(page, options);
  const size = page.viewportSize();
  const where = size ? `${size.width}×${size.height}` : "the viewport";
  expect(violations.map(describe), `layout of "${step}" at ${where}`).toEqual([]);
}
