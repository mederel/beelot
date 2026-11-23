// The coach of the tutorial (US-199): the texts of the server's codes, the lessons it lists, what the panel says and what a
// finished lesson offers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { Card, Coach, TutorialInfo } from "$lib/api/types";
import { fr } from "$lib/i18n/fr";
import { nl } from "$lib/i18n/nl";
import { LESSONS, WHY, WHY_NOT, coachLines, nextLesson } from "$lib/models/coach";
import { lessonsDone, markLessonDone } from "$lib/models/prefs";

const createTutorial = vi.fn();
vi.mock("$lib/api/client", () => ({ api: { createTutorial: (...args: unknown[]) => createTutorial(...args) } }));

const card = (rank: string, suit: string): Card => ({ rank, suit, symbol: "" }) as Card;
const coach: Coach = {
  progress: { step: 0, steps: 2, number: 2, lessons: 6 },
  card: card("J", "DIAMONDS"),
  why: "WIN_CHEAPLY",
  others: [{ card: card("A", "DIAMONDS"), whyNot: "TOO_STRONG" }]
};
const tutorial = (extra: Partial<TutorialInfo> = {}): TutorialInfo => ({ lesson: "win-cheaply", lessonDone: false, coach, ...extra });

// The variants of a Rust enum, as the SCREAMING_SNAKE codes the server serializes.
function codesOf(file: string, name: string): string[] {
  const source = readFileSync(`../../${file}`, "utf8");
  const body = source.match(new RegExp(`pub enum ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  return [...body.matchAll(/^\s{4}([A-Z][A-Za-z]+),/gm)].map((match) => match[1].replace(/(?<!^)([A-Z])/g, "_$1").toUpperCase());
}

test("every reason the server can send has a text in English, French and Dutch", () => {
  const reasons = codesOf("beelot-game/src/bot/hints.rs", "CardReason");
  const whyNot = codesOf("beelot-game/src/bot/hints.rs", "WhyNot");
  assert.ok(reasons.length >= 9 && whyNot.length >= 12, "the enums were read");
  for (const code of reasons) assert.ok(WHY[code], `no text for the reason ${code}`);
  for (const code of whyNot) assert.ok(WHY_NOT[code], `no text for why not ${code}`);
  assert.deepEqual(Object.keys(WHY).sort(), reasons.sort());
  assert.deepEqual(Object.keys(WHY_NOT).sort(), whyNot.sort());
  for (const text of [...Object.values(WHY), ...Object.values(WHY_NOT), ...LESSONS.flatMap((lesson) => [lesson.title, lesson.goal])]) {
    assert.ok(Object.hasOwn(fr, text), `fr: ${text}`);
    assert.ok(Object.hasOwn(nl, text), `nl: ${text}`);
  }
});

test("the lessons are the server's, in the same order", () => {
  const source = readFileSync("../../beelot-table/src/tutorial.rs", "utf8");
  const ids = [...source.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.deepEqual(
    LESSONS.map((lesson) => lesson.id),
    ids
  );
});

test("the coach says which card to play, why, and why not the card that was tapped", () => {
  const lines = coachLines(tutorial(), null)!;
  assert.deepEqual(lines.heading.lesson, { number: 2, lessons: 6, title: "Win cheaply", step: 1, steps: 2 });
  assert.equal(lines.instruction.key, "Play {0}.");
  assert.equal(lines.why.key, WHY.WIN_CHEAPLY);
  assert.equal(lines.tapped, null);
  const tapped = coachLines(tutorial(), "A-DIAMONDS")!.tapped!;
  assert.equal(tapped.key, WHY_NOT.TOO_STRONG);
  assert.equal(tapped.best.rank, "J");
  assert.equal(tapped.other.rank, "A");
  assert.equal(coachLines(tutorial(), "7-HEARTS")!.tapped, null);
  assert.equal(coachLines(tutorial({ coach: undefined }), null), null);
});

test("the free game has no lesson heading, and the lessons follow one another", () => {
  assert.equal(coachLines(tutorial({ lesson: undefined, coach: { ...coach, progress: undefined } }), null)!.heading.lesson, null);
  assert.equal(nextLesson("lead-trump"), "win-cheaply");
  assert.equal(nextLesson("give-points"), null);
  assert.equal(nextLesson(undefined), null);
});

test("finished lessons are remembered, and blocked storage reads as none", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key)
  };
  assert.deepEqual(lessonsDone(storage), []);
  markLessonDone(storage, "cut");
  markLessonDone(storage, "cut");
  markLessonDone(storage, "lead-trump");
  assert.deepEqual(lessonsDone(storage), ["cut", "lead-trump"]);
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {}
  };
  assert.deepEqual(lessonsDone(blocked), []);
  markLessonDone(blocked, "cut");
});

let unmount: () => void = () => {};
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("beelot.language", "en");
  createTutorial.mockReset();
  window.scrollTo = vi.fn() as never;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => {
  unmount();
  document.body.replaceChildren();
});

async function panel(game: Record<string, unknown>) {
  const { flushSync, mount, unmount: remove } = await import("svelte");
  const { default: CoachPanel } = await import("../../src/table/CoachPanel.svelte");
  const target = document.createElement("div");
  document.body.append(target);
  const instance = mount(CoachPanel, { target, props: { game: { stage: "play", viewer: 0, seats: [], openHands: null, coachTapped: null, flash() {}, ...game } as never } });
  unmount = () => remove(instance);
  flushSync();
  return target;
}

test("the panel names the card, gives the reason and, after a wrong tap, why not that card", async () => {
  const target = await panel({ tutorial: tutorial(), coachTapped: "A-DIAMONDS" });
  const text = target.textContent ?? "";
  assert.match(text, /Lesson 2 of 6/);
  assert.match(text, /Step 1 of 2/);
  assert.match(text, /Play J of diamonds\./);
  assert.match(text, /cheapest card that wins it/);
  assert.match(text, /Not A of diamonds: that card wins too/);
  assert.equal(target.querySelectorAll("[style]").length, 0, "no inline style");
});

test("a finished lesson offers the next one and remembers itself", async () => {
  createTutorial.mockResolvedValue({ tableId: "next", playerToken: "t" });
  const target = await panel({ tutorial: tutorial({ coach: undefined, lessonDone: true }) });
  assert.match(target.textContent ?? "", /Lesson complete!/);
  assert.deepEqual(lessonsDone(localStorage), ["win-cheaply"]);
  const next = [...target.querySelectorAll("button")].find((button) => /Next lesson/.test(button.textContent ?? ""))!;
  next.click();
  await vi.waitFor(() => assert.deepEqual(createTutorial.mock.calls[0], ["follow-suit"]));
});

test("the last lesson leads to the free game and counts the tutorial as seen", async () => {
  const target = await panel({ tutorial: tutorial({ lesson: "give-points", coach: undefined, lessonDone: true }) });
  assert.equal(localStorage.getItem("beelot.tutorial-seen"), "true");
  assert.match(target.textContent ?? "", /Play a free game/);
  assert.doesNotMatch(target.textContent ?? "", /Next lesson/);
});

test("the free game's auction and the bots' turns have a word of their own", async () => {
  const free = tutorial({ lesson: undefined, coach: undefined });
  assert.match((await panel({ tutorial: free, stage: "auction" })).textContent ?? "", /take the suit if your hand is strong/);
  unmount();
  document.body.replaceChildren();
  assert.match((await panel({ tutorial: free })).textContent ?? "", /Watch the bots play/);
});
