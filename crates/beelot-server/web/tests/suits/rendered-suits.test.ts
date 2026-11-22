// Every suit on screen is an SVG we draw, never a font character (the bug: suits hard to see, spades and clubs alike). The
// table's components are drawn from the server's recorded snapshots; their text and markup are searched for a suit
// character, and each suit symbol must be an <svg data-suit>.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test, vi } from "vitest";

const read = (name: string) => JSON.parse(readFileSync(`../tests/contract/${name}.json`, "utf8"));
const act = vi.fn();
const table = vi.fn();
vi.mock("$lib/api/client", () => ({
  api: { act, table, analysis: vi.fn(async () => null), explanations: vi.fn(async () => []), hint: vi.fn() },
  ApiError: class extends Error {},
  currentSnapshot: vi.fn(),
  forgetTableSession: vi.fn(),
  setPrivateSession: vi.fn(),
  tableToken: vi.fn(() => "token")
}));
vi.mock("../../src/table/stream", () => ({ openTableStream: vi.fn(), closeTableStream: vi.fn() }));
vi.mock("$lib/audio/sfx", async (original) => ({ ...(await original<object>()), sfx: { play: vi.fn(), setEnabled: vi.fn(), enabled: () => true } }));
vi.mock("$lib/fx/particles", () => ({ burst: vi.fn() }));

const ID = "01234567-89ab-cdef-0123-456789abcdef";
const WHOLE_TABLE = 60_000;
// A suit character of any kind: the card suits, the variation selector that makes them emoji, the playing-card emoji.
const SUIT_CHARACTERS = /[\u2660-\u2667]|\uFE0F|[\u{1F0A0}-\u{1F0FF}]/u;
let unmountAll: () => void = () => {};
let destroy: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem("beelot.language", "en");
  localStorage.setItem("beelot.effects", "off");
  [act, table].forEach((mock) => mock.mockReset());
  window.scrollTo = vi.fn() as never;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
  vi.resetModules();
});

afterEach(() => {
  unmountAll();
  destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function draw(snapshot: unknown, path: string, component: "Hand" | "AuctionPanel" | "RoundResult" | "TableView") {
  const whole = component === "TableView";
  table.mockResolvedValue(snapshot);
  history.replaceState({}, "", path);
  const { router } = await import("$lib/stores/router.svelte");
  router.path = path;
  const { TableGame } = await import("../../src/table/game.svelte");
  const { flushSync, mount, unmount } = await import("svelte");
  const phase = path.includes("bidding") ? "auction" : null;
  const game = new TableGame(ID, phase);
  destroy = () => game.destroy();
  if (!whole) {
    await game.loadSolo();
    await vi.advanceTimersByTimeAsync(500);
  }
  const { default: Component } = await import(`../../src/table/${component}.svelte`);
  const target = document.createElement("div");
  document.body.append(target);
  const app = mount(Component, { target, props: whole ? { id: ID, phase } : { game } });
  unmountAll = () => unmount(app);
  flushSync();
  if (whole) await vi.advanceTimersByTimeAsync(500);
  flushSync();
  return { game, target };
}

// The recorded trick under review, made the player's turn.
function myTurn() {
  const snapshot = read("trick_under_review");
  snapshot.board.reviewingCompletedTrick = false;
  snapshot.board.currentTrick = [];
  snapshot.board.trickWinner = null;
  snapshot.board.legalCards = snapshot.board.hand.slice(0, 2);
  snapshot.table.kind = "LOCAL";
  return snapshot;
}

function assertDrawn(target: HTMLElement, expected: string[], where: string) {
  assert.doesNotMatch(target.textContent ?? "", SUIT_CHARACTERS, `${where}: a suit character in the text`);
  assert.doesNotMatch(new XMLSerializer().serializeToString(target), SUIT_CHARACTERS, `${where}: a suit character in the markup`);
  const drawn = new Set([...target.querySelectorAll("svg[data-suit]")].map((svg) => svg.getAttribute("data-suit")));
  for (const suit of expected) assert.ok(drawn.has(suit), `${where}: ${suit} is not drawn as an svg (drawn: ${[...drawn].join(",")})`);
  for (const svg of target.querySelectorAll("svg[data-suit]")) {
    assert.equal(svg.getAttribute("aria-hidden"), "true", `${where}: a suit svg is named by the text beside it`);
    assert.ok(svg.querySelector("path"), `${where}: a suit svg has a shape`);
  }
}

test("the Contrée auction panel draws its four suits, its history and its title as svg", async () => {
  const { target } = await draw(read("contree_bidding"), `/play/bot/bidding/${ID}`, "AuctionPanel");
  assertDrawn(target, ["clubs", "diamonds", "hearts", "spades"], "contree auction");
  assert.ok(target.querySelectorAll(".history svg[data-suit]").length > 0, "the history of calls shows the suit as svg");
  assert.match(target.textContent!, /Hearts/, "the suit's name stays for a screen reader");
});

test("the Classic auction panel draws its suits as svg", async () => {
  const { target } = await draw(read("classic_auction_round_2"), `/play/bot/bidding/${ID}`, "AuctionPanel");
  assertDrawn(target, ["clubs", "diamonds", "hearts", "spades"], "classic auction");
});

test("the round result has no suit character", async () => {
  const { target } = await draw(read("round_over_with_announcements"), `/play/bot/game/${ID}`, "RoundResult");
  assertDrawn(target, [], "round result");
});

test("the hand's cards draw their suits as svg", async () => {
  const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "Hand");
  const suits = myTurn().board.hand.map((card: { suit: string }) => card.suit.toLowerCase());
  assertDrawn(target, [...new Set<string>(suits)], "hand");
});

test(
  "the seats' call badges draw their suits as svg",
  async () => {
    const { target } = await draw(read("contree_bidding"), `/play/bot/bidding/${ID}`, "TableView");
    assertDrawn(target, ["hearts"], "table in a Contrée auction");
    assert.ok(target.querySelectorAll(".call svg[data-suit]").length > 0, "a seat's call shows its suit as svg");
  },
  WHOLE_TABLE
);

test(
  "the contract badge draws its suit as svg",
  async () => {
    const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "TableView");
    assert.ok(target.querySelector(".badge svg[data-suit]"), "the contract badge draws its suit as svg");
    assertDrawn(target, ["spades"], "table in play");
  },
  WHOLE_TABLE
);

test("every card face of the deck draws its suit as svg", async () => {
  const { flushSync, mount, unmount } = await import("svelte");
  const { default: PlayingCard } = await import("$lib/cards/PlayingCard.svelte");
  const target = document.createElement("div");
  document.body.append(target);
  const apps = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"].flatMap((suit) =>
    ["7", "8", "9", "10", "J", "Q", "K", "A"].map((rank) => mount(PlayingCard, { target, props: { card: { rank, suit } as never } }))
  );
  flushSync();
  assertDrawn(target, ["clubs", "diamonds", "hearts", "spades"], "the deck");
  assert.equal(target.querySelectorAll(".index svg[data-suit]").length, 64, "two corner indexes per card");
  apps.forEach((app) => unmount(app));
});
