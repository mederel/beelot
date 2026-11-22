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
const NATURAL_SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

// The hand in the order it is shown: trump first, then the other suits, each from the weakest to the strongest card.
export function orderHandForDisplay<T extends Pick<Card, "rank" | "suit">>(cards: T[], trump?: string | null): T[] {
  const allTrumps = String(trump).toLowerCase() === "all trumps";
  const noTrumps = String(trump).toLowerCase() === "no trumps";
  const trumpSuit = trump && !allTrumps && !noTrumps ? trump.toUpperCase() : "";
  const suits = trumpSuit ? [trumpSuit, ...NATURAL_SUITS.filter((suit) => suit !== trumpSuit)] : NATURAL_SUITS;
  return [...cards].sort((left, right) => {
    const suitDifference = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDifference !== 0) return suitDifference;
    const ranks = allTrumps || left.suit === trumpSuit ? TRUMP_RANKS : NORMAL_RANKS;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}

export const cardKey = (card: Pick<Card, "rank" | "suit">) => `${card.rank}-${card.suit}`;
