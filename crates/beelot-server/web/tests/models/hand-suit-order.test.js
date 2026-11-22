import { test } from "vitest";
import assert from "node:assert/strict";
import { orderHandForDisplay, suitRow } from "$lib/models/card-physics";

const ALL = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const RED = new Set(["HEARTS", "DIAMONDS"]);
const isAvoided = (a, b) => [a, b].sort().join() === "CLUBS,HEARTS" || [a, b].sort().join() === "CLUBS,SPADES";

const permutations = (items) =>
  items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
const subsets = Array.from({ length: 15 }, (_, index) => ALL.filter((_suit, bit) => (index + 1) & (1 << bit)));
const pairs = (row) => row.slice(1).map((suit, i) => [row[i], suit]);
const sameColour = (row) => pairs(row).filter(([a, b]) => RED.has(a) === RED.has(b)).length;
const avoided = (row) => pairs(row).filter(([a, b]) => isAvoided(a, b)).length;

const naturalSort = { 7: 0, 8: 1, 9: 2, J: 3, Q: 4, K: 5, 10: 6, A: 7 };
const trumpSort = { 7: 0, 8: 1, Q: 2, K: 3, 10: 4, A: 5, 9: 6, J: 7 };

// A deterministic shuffle, so a failure can be replayed.
function shuffled(items, seed) {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test("the four suits are hearts, spades, diamonds, clubs in every input order", () => {
  for (const input of permutations(ALL)) assert.deepEqual(suitRow(input), ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"]);
});

test("every subset of suits, in every input order, gets the best deterministic row", () => {
  for (const subset of subsets) {
    const rows = permutations(subset);
    const bestColour = Math.min(...rows.map(sameColour));
    const bestAvoided = Math.min(...rows.filter((r) => sameColour(r) === bestColour).map(avoided));
    const expected = suitRow(subset);
    for (const input of rows) {
      const row = suitRow(input);
      assert.deepEqual(row, expected, `${input} gives the same row as ${subset}`);
      assert.deepEqual([...row].sort(), [...subset].sort());
      assert.equal(sameColour(row), bestColour, `${row}: colours alternate as far as possible`);
      assert.equal(avoided(row), bestAvoided, `${row}: clubs next to hearts or spades only when unavoidable`);
    }
    const restricted = ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"].filter((s) => subset.includes(s));
    if (subset.length === 4) assert.deepEqual(expected, restricted);
    else if (sameColour(restricted) === bestColour && avoided(restricted) === bestAvoided) assert.deepEqual(expected, restricted);
  }
});

test("a hand keeps each suit together and sorted, whatever the trump, for every subset of suits", () => {
  const trumps = [null, "No trumps", "All trumps", ...ALL];
  let seed = 1;
  for (const subset of subsets) {
    const cards = subset.flatMap((suit) => RANKS.slice(0, 3).map((rank) => ({ rank, suit })));
    for (const trump of trumps) {
      const ordered = orderHandForDisplay(shuffled(cards, seed++), trump);
      assert.deepEqual(ordered, orderHandForDisplay(shuffled(cards, seed++), trump), "deterministic");
      assert.deepEqual(
        ordered.map((c) => c.suit).filter((s, i, a) => a.indexOf(s) === i),
        suitRow(subset),
        "suits in the row"
      );
      for (const suit of subset) {
        const mine = ordered.filter((c) => c.suit === suit);
        const first = ordered.indexOf(mine[0]);
        assert.deepEqual(ordered.slice(first, first + mine.length), mine, `${suit} is contiguous`);
        const strength = trump === "All trumps" || trump?.toUpperCase() === suit ? trumpSort : naturalSort;
        const values = mine.map((c) => strength[c.rank]);
        assert.deepEqual(
          values,
          [...values].sort((a, b) => a - b),
          `${suit} is sorted`
        );
      }
    }
  }
});
