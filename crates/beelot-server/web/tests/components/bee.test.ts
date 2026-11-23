// The bee is drawn with gradients that other elements reference by id. Several bees live in one page (the logo of the nav,
// which is hidden on a phone, and the bees of the home page), so each one needs its own ids: a copy that shares the
// first one's ids loses its gradients when that first copy sits in a hidden element, and the bee turns black.
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import Bee from "$lib/brand/Bee.svelte";

const mounted: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const app of mounted.splice(0)) unmount(app);
  document.body.replaceChildren();
});

test("every bee in a page has its own gradient ids, and each reference resolves", () => {
  const hidden = document.createElement("div");
  hidden.style.display = "none";
  const visible = document.createElement("div");
  document.body.append(hidden, visible);

  mounted.push(mount(Bee, { target: hidden, props: { size: "1.35em" } }));
  mounted.push(mount(Bee, { target: visible, props: { size: "3.4rem" } }));
  mounted.push(mount(Bee, { target: visible, props: { size: "2.6rem", flutter: false } }));
  flushSync();

  const ids = [...document.querySelectorAll("svg.bee [id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(", ")}`);

  for (const svg of document.querySelectorAll("svg.bee")) {
    const references = [...svg.querySelectorAll("[fill], [stroke]")]
      .flatMap((element) => [element.getAttribute("fill"), element.getAttribute("stroke")])
      .map((value) => /url\(#([^)]+)\)/.exec(value ?? "")?.[1])
      .filter((id): id is string => id !== undefined);
    assert.ok(references.length >= 2, "each bee paints its body and wings with a gradient");
    for (const id of references) {
      assert.ok(svg.querySelector(`#${CSS.escape(id)}`), `gradient ${id} is defined inside its own bee`);
    }
  }
});
