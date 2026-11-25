// The worst-case content and the text checks (US-204): the longest names, the largest numbers, the longest lists, and a check that
// no label is cut or wrapped beyond what its layout allows. The tables are the recorded snapshots of tests/contract, changed to
// their worst case by `worstCase`.
import type { Page } from "@playwright/test";
import { fixture, type Snapshot } from "./mock";

/** The longest name a player may have (MAX_DISPLAY_NAME): 30 characters, with accents and an emoji, and no space to wrap at. */
export const MAX_NAME_LENGTH = 30;
const longName = (seed: string) => [...seed.repeat(8)].slice(0, MAX_NAME_LENGTH).join("");
export const LONG_NAMES = [longName("Éloïse🐝Wëñdélïn-"), longName("Zoë🐝Çàrlö-Ünïcödé-"), longName("Åsa🐝Ñandú-Ïñgrïd-"), longName("Žofia🐝Östen-Ælfwïne-")];
/** The widest letters the invitation code allows (six characters). */
export const LONG_CODE = "WWMMWW";
/** A crew name as long as a player name: the friends of the crew tab carry the same names. */
export const LONG_CREW_NAME = LONG_NAMES[0];
export const LARGEST_SCORE = 99999;

const RENAMED: Record<string, number> = { Ana: 0, Camille: 1, Luc: 2, Manon: 3, You: 0, Ben: 1 };

function rename(value: unknown): unknown {
  if (typeof value === "string") {
    if (value in RENAMED) return LONG_NAMES[RENAMED[value]];
    // A sentence that names a player ("Luc wins the trick").
    return value.replace(/\b(Ana|Camille|Luc|Manon)\b/g, (name) => LONG_NAMES[RENAMED[name]]);
  }
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rename(inner)]));
  return value;
}

const EXTRA_CARDS = [
  { rank: "7", suit: "DIAMONDS", symbol: "♦" },
  { rank: "8", suit: "DIAMONDS", symbol: "♦" },
  { rank: "9", suit: "DIAMONDS", symbol: "♦" },
  { rank: "10", suit: "DIAMONDS", symbol: "♦" },
  { rank: "J", suit: "DIAMONDS", symbol: "♦" },
  { rank: "Q", suit: "DIAMONDS", symbol: "♦" },
  { rank: "K", suit: "DIAMONDS", symbol: "♦" },
  { rank: "A", suit: "DIAMONDS", symbol: "♦" }
];

/** A hand of eight cards: the cards it has, and the diamonds that it has not, up to eight. */
function fillHand(hand: Array<{ rank: string; suit: string; symbol: string }>) {
  for (const card of EXTRA_CARDS) {
    if (hand.length >= 8) break;
    if (!hand.some((own) => own.rank === card.rank && own.suit === card.suit)) hand.push({ ...card });
  }
}

/** A recorded snapshot at its worst: four long names, a hand of eight, the largest scores and the longest list of announcements. */
export function worstCase(name: string): Snapshot {
  const table = rename(fixture(name)) as Snapshot;
  if (table.board?.hand) {
    fillHand(table.board.hand);
    for (const seat of table.board.seats ?? []) if (seat.you || seat.cardCount !== undefined) seat.cardCount = 8;
  }
  if (table.bidding?.hand) fillHand(table.bidding.hand);
  if (table.board) {
    table.board.eastWestScore = LARGEST_SCORE;
    table.board.northSouthScore = LARGEST_SCORE;
    const result = table.board.roundResult;
    if (result) {
      for (const key of ["eastWestAwarded", "northSouthAwarded", "eastWestCardPoints", "northSouthCardPoints"]) result[key] = LARGEST_SCORE;
      // The longest list of announcements: every player announces, and each announces four.
      const base = result.announcements?.[0];
      if (base) {
        result.announcements = LONG_NAMES.map((player, seat) => ({
          ...base,
          player,
          seat,
          announcements: Array.from({ length: 4 }, (_, index) => ({ ...base.announcements[0], value: 20 + index * 30 }))
        }));
      }
    }
  }
  if (table.match) {
    table.match.eastWest = LARGEST_SCORE;
    table.match.northSouth = LARGEST_SCORE - 1;
  }
  if (table.table?.invitationCode) table.table.invitationCode = LONG_CODE;
  return table;
}

/** What the text check finds wrong with a label, quoted in the failure. */
export interface TextFault {
  element: string;
  detail: string;
}

export interface TextOptions {
  /** The lines a button, a tab or a link may take. Default 2. */
  maxLines?: number;
  /** The lines a heading may take. Default 3. */
  maxHeadingLines?: number;
  /** Labels that may be cut or may take more lines, each with its reason (a selector). */
  exempt?: { selector: string; reason: string }[];
}

// Runs in the page. A label is cut when its text is wider or taller than its box and the box hides what is beyond it, with no
// ellipsis made on purpose (`text-overflow: ellipsis`, or a line clamp). It wraps too much when it takes more lines than allowed.
function measureText(args: { maxLines: number; maxHeadingLines: number; exempt: string[] }): TextFault[] {
  const { maxLines, maxHeadingLines, exempt } = args;
  const faults: TextFault[] = [];
  const TOLERANCE = 1;
  // An open dialog is an overlay: the page below it is dimmed and inert, so only what is in the dialog is judged.
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]'));
  const labels = Array.from(document.querySelectorAll('button, a[href], [role="button"], [role="tab"], h1, h2, h3, h4, label.variant, summary, legend'));
  for (const el of labels) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility !== "visible") continue;
    if (dialogs.length > 0 && !dialogs.some((dialog) => dialog.contains(el))) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    if (el.closest('[aria-hidden="true"], [hidden], [inert]') || exempt.some((selector) => el.closest(selector))) continue;
    // A playing card prints its rank and its suit in each corner: it is a picture, not a label.
    if (el.matches(".hand-card, .playing-card, [class*='card-face']") || el.closest(".hand, .trick")) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const name = `${el.getAttribute("role") ?? el.tagName.toLowerCase()} "${text.length > 40 ? `${text.slice(0, 37)}…` : text}"`;
    const hides = /hidden|clip/.test(style.overflowX + style.overflowY);
    const onPurpose = style.textOverflow === "ellipsis" || style.getPropertyValue("-webkit-line-clamp") !== "none";
    // The box hides its own text, or a child of it (the span that holds the label) hides it.
    // (a decoration inside a link, such as a glow, is not text: only the box itself and the runs of text count)
    const holders = [el, ...Array.from(el.querySelectorAll("*")).filter((inner) => inner.children.length === 0 && (inner.textContent ?? "").trim() !== "")].filter((inner) => {
      const innerStyle = getComputedStyle(inner);
      return /hidden|clip/.test(innerStyle.overflowX + innerStyle.overflowY) && (hides || inner !== el);
    });
    for (const holder of holders) {
      // A text for screen readers only is a box of one pixel, made to be unseen.
      if (holder.clientWidth <= 1 || holder.clientHeight <= 1) continue;
      const holderStyle = getComputedStyle(holder);
      if (holderStyle.textOverflow === "ellipsis" || holderStyle.getPropertyValue("-webkit-line-clamp") !== "none" || onPurpose) continue;
      if (holder.scrollWidth > holder.clientWidth + TOLERANCE) {
        faults.push({ element: name, detail: `cut: its text is ${holder.scrollWidth}px wide in a box of ${holder.clientWidth}px that hides the rest` });
        break;
      }
      if (holder.scrollHeight > holder.clientHeight + TOLERANCE && /hidden|clip/.test(holderStyle.overflowY)) {
        faults.push({ element: name, detail: `cut: its text is ${holder.scrollHeight}px tall in a box of ${holder.clientHeight}px that hides the rest` });
        break;
      }
    }
    // A link that is a card (a title and a description in blocks) is a layout of its own: only a label that is one run of text is counted in lines.
    if (
      Array.from(el.querySelectorAll("*")).some(
        (inner) => !/^inline/.test(getComputedStyle(inner).display) && getComputedStyle(inner).display !== "none" && getComputedStyle(inner).display !== "contents"
      )
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const lineTops = new Set(rects.map((rect) => Math.round(rect.top / 4)));
    const lines = lineTops.size;
    const allowed = /^H[1-4]$/.test(el.tagName) ? maxHeadingLines : maxLines;
    if (lines > allowed) faults.push({ element: name, detail: `wraps to ${lines} lines, the layout allows ${allowed}` });
  }
  return faults;
}

export async function findTextFaults(page: Page, options: TextOptions = {}): Promise<string[]> {
  const faults = await page.evaluate(measureText, {
    maxLines: options.maxLines ?? 2,
    maxHeadingLines: options.maxHeadingLines ?? 3,
    exempt: (options.exempt ?? []).map((rule) => rule.selector)
  });
  return faults.map((fault) => `${fault.element} — ${fault.detail}`);
}
