// The numbers behind the physical card play (US-089): the angle a played card rests at, which sentence explains an
// illegal card, and the order a hand is shown in while a deal arrives (US-140). Pure, so it is tested without a page.
import type { Card, IllegalCard } from "$lib/api/types";

const REST_ANGLE_DEGREES = 3;
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// A stable angle in [-3, 3] degrees for a card, so a played card rests the same way after a redraw.
export function restAngle(card: Pick<Card, "rank" | "suit">): number {
  let hash = 0x811c9dc5;
  for (const character of `${card.rank}-${card.suit}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }
  return round((hash % 61) / 10 - REST_ANGLE_DEGREES);
}

// The sentence (an English key for `t()`) and the suit to show for an `illegalCards` entry. `trump` is the board's
// trump as the server names it ("All trumps" for the all-trumps variant).
export function reasonText(entry: Pick<IllegalCard, "reason" | "suit">, trump: string): { key: string; suit: string | null } {
  if (entry.reason === "MUST_FOLLOW") return { key: "Follow the suit led: {0}", suit: entry.suit ?? null };
  if (entry.reason === "MUST_TRUMP") return { key: "You must trump.", suit: null };
  if (entry.reason === "MAY_NOT_UNDERTRUMP") return { key: "You may not undertrump: play a card of another suit.", suit: null };
  const allTrumps = trump === "All trumps" || trump === "ALL_TRUMPS";
  return { key: allTrumps ? "Play a higher card." : "Play a higher trump.", suit: null };
}

// The order a hand is shown in while a deal arrives (US-140): the cards already held stay where they are, and the new
// ones follow in the order the deal gave them. The taker's upturned card is the first new card in the server's order but
// arrives last, after their packet, so it moves to the end. Cards are keys such as "J-HEARTS".
export function arrivalOrder(heldKeys: string[], dealtKeys: string[], upturnedLast = false): string[] {
  const held = new Set(heldKeys);
  const arriving = dealtKeys.filter((key) => !held.has(key));
  if (upturnedLast && arriving.length > 1) arriving.push(arriving.shift()!);
  return [...heldKeys, ...arriving];
}

const NORMAL_RANKS = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const TRUMP_RANKS = ["7", "8", "Q", "K", "10", "A", "9", "J"];
// The row of suits in a hand. With four suits it is HEARTS, SPADES, DIAMONDS, CLUBS (its mirror is equally valid but not
// used): black and red alternate, and the clubs sit next to neither the hearts nor the spades. When the hand lacks suits the
// row is the best arrangement of the suits present, judged by: (1) the fewest neighbouring suits of one colour, (2) the
// fewest neighbouring pairs that are clubs and hearts or spades and clubs, (3) the order above restricted to the present
// suits. The row is the same for the same suits, whatever order they come in. The trump suit has no place of its own: the
// colour rule wins.
const SUIT_ROW = ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"];
const RED = new Set(["HEARTS", "DIAMONDS"]);
const AVOIDED_PAIRS = [
  ["CLUBS", "HEARTS"],
  ["SPADES", "CLUBS"]
];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

export function suitRow(present: Iterable<string>): string[] {
  const have = new Set(present);
  const suits = SUIT_ROW.filter((suit) => have.has(suit));
  const cost = (row: string[]) => {
    let sameColour = 0;
    let avoided = 0;
    for (let index = 1; index < row.length; index++) {
      const [before, after] = [row[index - 1], row[index]];
      if (RED.has(before) === RED.has(after)) sameColour++;
      if (AVOIDED_PAIRS.some(([one, two]) => (before === one && after === two) || (before === two && after === one))) avoided++;
    }
    return [sameColour, avoided];
  };
  // The permutations of the restricted order come in lexicographic order of it, and only a strictly better row replaces the
  // best one, so a tie keeps the restricted order of the four-suit row.
  let best = suits;
  let bestCost = cost(suits);
  for (const row of permutations(suits)) {
    const rowCost = cost(row);
    if (rowCost[0] < bestCost[0] || (rowCost[0] === bestCost[0] && rowCost[1] < bestCost[1])) {
      best = row;
      bestCost = rowCost;
    }
  }
  return best;
}

// The hand in the order it is shown: the suits in `suitRow` order, each from the weakest to the strongest card (the trump
// suit by its own strength order).
export function orderHandForDisplay<T extends Pick<Card, "rank" | "suit">>(cards: T[], trump?: string | null): T[] {
  const allTrumps = String(trump).toLowerCase() === "all trumps";
  const noTrumps = String(trump).toLowerCase() === "no trumps";
  const trumpSuit = trump && !allTrumps && !noTrumps ? trump.toUpperCase() : "";
  const suits = suitRow(cards.map((card) => card.suit));
  return [...cards].sort((left, right) => {
    const suitDifference = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDifference !== 0) return suitDifference;
    const ranks = allTrumps || left.suit === trumpSuit ? TRUMP_RANKS : NORMAL_RANKS;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}

export const cardKey = (card: Pick<Card, "rank" | "suit">) => `${card.rank}-${card.suit}`;
