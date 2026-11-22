// The four suits, drawn by us on one 100 x 100 box as heavy filled silhouettes (the one place a suit takes its shape; no
// font character is ever used). The club is a trefoil: three round lobes (top, left, right) on a stem with a foot. The
// spade is an inverted heart: ONE pointed tip on top, no lobe up there, then a stem and a foot. A test pins these data.
export type SuitKey = "clubs" | "diamonds" | "hearts" | "spades";

export interface SuitShape {
  /** Round lobes as [cx, cy, r]: three for the club, none for the others. */
  lobes: [number, number, number][];
  /** The rest of the silhouette (one path). */
  path: string;
}

export const SUIT_SHAPES: Record<SuitKey, SuitShape> = {
  clubs: {
    lobes: [
      [50, 27, 23],
      [26, 60, 23],
      [74, 60, 23]
    ],
    path: "M43 55h14c0 18 3 28 13 41H30c10-13 13-23 13-41z"
  },
  spades: {
    lobes: [],
    path: "M50 3C57 24 93 40 93 62c0 13-10 22-22 22-8 0-14-4-18-10 1 9 5 17 13 22H34c8-5 12-13 13-22-4 6-10 10-18 10C17 84 7 75 7 62 7 40 43 24 50 3z"
  },
  hearts: {
    lobes: [],
    path: "M50 94C20 72 4 54 4 33 4 17 16 6 30 6c9 0 16 5 20 13C54 11 61 6 70 6c14 0 26 11 26 27 0 21-16 39-46 61z"
  },
  diamonds: {
    lobes: [],
    path: "M50 2C58 20 78 36 98 50 78 64 58 80 50 98 42 80 22 64 2 50 22 36 42 20 50 2z"
  }
};

export function suitKey(suit: string): SuitKey {
  const key = String(suit).toLowerCase();
  return key === "hearts" || key === "diamonds" || key === "spades" ? key : "clubs";
}
