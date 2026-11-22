// The shared building blocks, mounted in a DOM: what a player taps, types and reads.
import assert from "node:assert/strict";
import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, test, vi } from "vitest";
import Button from "$lib/ui/Button.svelte";
import Switch from "$lib/ui/Switch.svelte";

const play = vi.fn();
vi.mock("$lib/audio/sfx", () => ({ sfx: { play: (name: string) => play(name), setEnabled: vi.fn(), enabled: () => true } }));

let target: HTMLElement;
let app: Record<string, unknown> | null = null;

beforeEach(() => {
  play.mockReset();
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

const text = (content: string) => createRawSnippet(() => ({ render: () => `<span>${content}</span>` }));

test("a primary button taps with a sound and calls its handler", () => {
  const onclick = vi.fn();
  app = mount(Button, { target, props: { children: text("Play"), onclick } });
  const button = target.querySelector("button")!;
  assert.equal(button.textContent?.trim(), "Play");
  button.click();
  assert.equal(onclick.mock.calls.length, 1);
  assert.deepEqual(play.mock.calls, [["tap"]]);
});

test("a secondary button is silent unless asked", () => {
  app = mount(Button, { target, props: { variant: "secondary", children: text("More") } });
  target.querySelector("button")!.click();
  assert.equal(play.mock.calls.length, 0);
});

test("a button with an address is a link", () => {
  app = mount(Button, { target, props: { href: "/stats", children: text("Stats") } });
  const link = target.querySelector("a")!;
  assert.equal(link.getAttribute("href"), "/stats");
  assert.equal(target.querySelector("button"), null);
});

test("a switch says whether it is on, and tapping turns it and tells the owner", () => {
  const onchange = vi.fn();
  app = mount(Switch, { target, props: { checked: false, label: "Sound effects", onchange } });
  const toggle = target.querySelector<HTMLButtonElement>('[role="switch"]')!;
  assert.equal(toggle.getAttribute("aria-checked"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "Sound effects");
  toggle.click();
  flushSync();
  assert.equal(toggle.getAttribute("aria-checked"), "true");
  assert.deepEqual(onchange.mock.calls, [[true]]);
  assert.deepEqual(play.mock.calls, [["toggle"]]);
});

// ---------------------------------------------------------------- the rest of the building blocks
import Segmented from "$lib/ui/Segmented.svelte";
import CodeBoxes from "$lib/ui/CodeBoxes.svelte";
import SuitText from "$lib/ui/SuitText.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import Sheet from "$lib/ui/Sheet.svelte";
import { setEffects } from "$lib/stores/settings.svelte";

test("a segmented choice is a radio group; choosing an option tells the owner", () => {
  const onchange = vi.fn();
  app = mount(Segmented, {
    target,
    props: {
      name: "pace",
      label: "Pace",
      value: "normal",
      options: [
        { value: "quick", label: "Quick" },
        { value: "normal", label: "Normal" },
        { value: "slow", label: "Slow", disabled: true }
      ],
      onchange
    }
  });
  assert.ok(target.querySelector('[role="radiogroup"]'));
  const radios = [...target.querySelectorAll<HTMLInputElement>("input[type=radio]")];
  assert.deepEqual(
    radios.map((radio) => radio.checked),
    [false, true, false]
  );
  assert.equal(radios[2].disabled, true);
  radios[0].click();
  assert.deepEqual(onchange.mock.calls, [["quick"]]);
  assert.deepEqual(play.mock.calls, [["tap"]]);
});

test("a hidden option is not drawn", () => {
  app = mount(Segmented, {
    target,
    props: {
      name: "x",
      label: "X",
      value: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B", hidden: true }
      ]
    }
  });
  assert.equal(target.querySelectorAll("input[type=radio]").length, 1);
});

test("a character deleted from a code box stays deleted", () => {
  app = mount(CodeBoxes, { target, props: { value: "", labelledby: "label" } });
  flushSync();
  const boxes = [...target.querySelectorAll<HTMLInputElement>("input")];
  boxes[0].value = "abc234";
  boxes[0].dispatchEvent(new Event("input", { bubbles: true }));
  boxes[2].value = "";
  boxes[2].dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  assert.deepEqual(
    boxes.map((box) => box.value),
    ["A", "B", "", "2", "3", "4"]
  );
});

test("the six code boxes take one character each, a paste spreads, and Backspace in an empty box goes back", () => {
  const props = { value: "" };
  app = mount(CodeBoxes, {
    target,
    props: {
      get value() {
        return props.value;
      },
      set value(v: string) {
        props.value = v;
      },
      labelledby: "label"
    }
  });
  flushSync();
  const boxes = [...target.querySelectorAll<HTMLInputElement>("input")];
  assert.equal(boxes.length, 6);
  assert.equal(target.querySelector("[role=group]")!.getAttribute("aria-labelledby"), "label");
  boxes[0].value = "abc234";
  boxes[0].dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  assert.deepEqual(
    boxes.map((box) => box.value),
    ["A", "B", "C", "2", "3", "4"]
  );
  assert.equal(props.value, "ABC234");
  const focus = vi.spyOn(boxes[2], "focus");
  boxes[3].value = "";
  boxes[3].dispatchEvent(new Event("input", { bubbles: true }));
  const backspace = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
  boxes[3].dispatchEvent(backspace);
  assert.equal(backspace.defaultPrevented, true);
  assert.equal(focus.mock.calls.length, 1);
});

test("suit names in a text get their symbol, and the name stays for a screen reader when only the symbol shows", () => {
  localStorage.setItem("beelot.language", "en");
  app = mount(SuitText, { target, props: { text: "80 Hearts", symbolOnly: true } });
  assert.ok(target.querySelector(".suit-word"));
  assert.ok(target.querySelector(".suit-word .visually-hidden"));
  assert.match(target.textContent!, /80/);
});

test("a playing card names itself for a screen reader and marks red suits", () => {
  localStorage.setItem("beelot.language", "en");
  app = mount(PlayingCard, { target, props: { card: { rank: "J", suit: "HEARTS" } } });
  const face = target.querySelector<HTMLElement>(".face")!;
  assert.equal(face.getAttribute("role"), "img");
  assert.ok(face.getAttribute("aria-label"));
  assert.equal(face.dataset.card, "J-HEARTS");
  assert.ok(face.classList.contains("red"));
  assert.ok(face.classList.contains("court"));
});

test("a card without a label is decorative, and a black suit is not red", () => {
  app = mount(PlayingCard, { target, props: { card: { rank: "7", suit: "SPADES" }, label: false } });
  const face = target.querySelector<HTMLElement>(".face")!;
  assert.equal(face.getAttribute("role"), null);
  assert.equal(face.getAttribute("aria-label"), null);
  assert.ok(!face.classList.contains("red"));
  assert.ok(!face.classList.contains("court"));
});

test("a sheet is a modal dialog that opens with its content, closes with its button, and says why", async () => {
  window.matchMedia = (() => ({ matches: false })) as never;
  setEffects("off");
  const onclose = vi.fn();
  const opened = { open: true };
  app = mount(Sheet, {
    target,
    props: {
      get open() {
        return opened.open;
      },
      set open(v: boolean) {
        opened.open = v;
      },
      label: "Settings",
      onclose,
      children: text("Inside")
    }
  });
  flushSync();
  const dialog = target.querySelector("dialog")!;
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent!, /Inside/);
  dialog.querySelector<HTMLButtonElement>("button")!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
  assert.equal(opened.open, false);
  assert.equal(dialog.open, false);
  assert.deepEqual(onclose.mock.calls, [["closed"]]);
});

test("a sheet that cannot be dismissed has no close button", () => {
  window.matchMedia = (() => ({ matches: false })) as never;
  app = mount(Sheet, { target, props: { open: true, label: "Cover", dismissible: false, closeButton: false, children: text("Hold the device") } });
  flushSync();
  assert.equal(target.querySelectorAll("dialog button").length, 0);
});
