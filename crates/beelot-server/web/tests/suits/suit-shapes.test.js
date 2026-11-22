// The shapes that tell the black suits apart: the club is a trefoil (three round lobes on a stem), the spade is an inverted
// heart with one pointed tip and no round lobe. The path data are pinned so an accidental edit is caught.
import assert from "node:assert/strict";
import { flushSync, mount, unmount } from "svelte";
import { expect, test } from "vitest";
import Suit from "$lib/cards/Suit.svelte";
import { SUIT_SHAPES } from "$lib/cards/suit-shapes";

function draw(suit) {
  const target = document.createElement("div");
  document.body.append(target);
  const app = mount(Suit, { target, props: { suit } });
  flushSync();
  return { svg: target.querySelector("svg"), done: () => unmount(app) };
}

test("the club has three round lobes (top, left, right) and a stem", () => {
  const { svg, done } = draw("CLUBS");
  const lobes = [...svg.querySelectorAll("circle[data-lobe]")];
  assert.equal(lobes.length, 3);
  const [top, left, right] = lobes.map((lobe) => ({ x: +lobe.getAttribute("cx"), y: +lobe.getAttribute("cy") }));
  assert.ok(top.y < left.y && top.y < right.y, "one lobe on top, two below");
  assert.ok(left.x < top.x && top.x < right.x, "one lobe left, one right of the top one");
  assert.equal(svg.querySelectorAll("path[data-body]").length, 1, "the stem and foot");
  done();
});

test("the spade has no round lobe: one pointed tip on top, then a stem and a foot", () => {
  const { svg, done } = draw("spades");
  assert.equal(svg.querySelectorAll("circle, ellipse").length, 0);
  assert.equal(svg.querySelectorAll("path[data-body]").length, 1);
  done();
});

test("every suit is an svg of one box and only the club has lobes", () => {
  for (const suit of ["clubs", "diamonds", "hearts", "spades"]) {
    const { svg, done } = draw(suit.toUpperCase());
    assert.equal(svg.getAttribute("viewBox"), "0 0 100 100");
    assert.equal(svg.getAttribute("data-suit"), suit);
    assert.equal(svg.querySelectorAll("circle[data-lobe]").length, suit === "clubs" ? 3 : 0);
    done();
  }
});

test("the shapes' data are pinned", () => {
  expect(SUIT_SHAPES).toMatchInlineSnapshot(`
    {
      "clubs": {
        "lobes": [
          [
            50,
            27,
            23,
          ],
          [
            26,
            60,
            23,
          ],
          [
            74,
            60,
            23,
          ],
        ],
        "path": "M43 55h14c0 18 3 28 13 41H30c10-13 13-23 13-41z",
      },
      "diamonds": {
        "lobes": [],
        "path": "M50 2C58 20 78 36 98 50 78 64 58 80 50 98 42 80 22 64 2 50 22 36 42 20 50 2z",
      },
      "hearts": {
        "lobes": [],
        "path": "M50 94C20 72 4 54 4 33 4 17 16 6 30 6c9 0 16 5 20 13C54 11 61 6 70 6c14 0 26 11 26 27 0 21-16 39-46 61z",
      },
      "spades": {
        "lobes": [],
        "path": "M50 3C57 24 93 40 93 62c0 13-10 22-22 22-8 0-14-4-18-10 1 9 5 17 13 22H34c8-5 12-13 13-22-4 6-10 10-18 10C17 84 7 75 7 62 7 40 43 24 50 3z",
      },
    }
  `);
});
