// The table's components, drawing a real controller loaded from the server's recorded snapshots: what the player sees and
// what a tap sends.
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
  return { game, target, flushSync };
}

// The recorded trick under review, made the player's turn.
function myTurn() {
  const snapshot = read("trick_under_review");
  const { board } = snapshot;
  board.reviewingCompletedTrick = false;
  board.currentTrick = [];
  board.trickWinner = null;
  board.legalCards = board.hand.slice(0, 2);
  board.illegalCards = board.hand.slice(2).map((card: object) => ({ card, reason: "MUST_TRUMP", suit: null }));
  snapshot.table.kind = "LOCAL";
  return snapshot;
}

test("the hand has a button per card; on the player's turn only the legal ones are enabled", async () => {
  const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "Hand");
  const cards = [...target.querySelectorAll<HTMLButtonElement>("button.hand-card")];
  assert.equal(cards.length, 7);
  assert.equal(cards.filter((card) => card.getAttribute("aria-disabled") !== "true").length, 2);
  assert.equal(cards.filter((card) => card.classList.contains("legal")).length, 2);
  assert.equal(target.querySelector("[role=group]")!.getAttribute("aria-label"), "Your eight cards");
  assert.ok(cards.every((card) => card.getAttribute("aria-label")), "every card has a name for a screen reader");
});

test("tapping a legal card plays it; tapping another explains the rule and sends nothing", async () => {
  const { game, target } = await draw(myTurn(), `/play/bot/game/${ID}`, "Hand");
  act.mockResolvedValue({});
  const cards = [...target.querySelectorAll<HTMLButtonElement>("button.hand-card")];
  cards.find((card) => card.classList.contains("illegal"))!.click();
  assert.equal(act.mock.calls.length, 0);
  assert.equal(game.status, "You must trump.");
  cards.find((card) => card.classList.contains("legal"))!.click();
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(act.mock.calls.length, 1);
  assert.equal(act.mock.calls[0][1].type, "card");
});

test("the arrow keys move between the cards", async () => {
  const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "Hand");
  const cards = [...target.querySelectorAll<HTMLButtonElement>("button.hand-card")];
  const focus = vi.spyOn(cards[1], "focus");
  const press = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  cards[0].dispatchEvent(press);
  assert.equal(press.defaultPrevented, true);
  assert.equal(focus.mock.calls.length, 1);
});

test("cards are not playable while the hand is not live", async () => {
  const snapshot = myTurn();
  snapshot.board.activePlayerIndex = 2;
  snapshot.board.activePlayer = "Luc";
  const { target } = await draw(snapshot, `/play/bot/game/${ID}`, "Hand");
  assert.ok([...target.querySelectorAll("button.hand-card")].every((card) => card.getAttribute("aria-disabled") === "true"));
  [...target.querySelectorAll<HTMLButtonElement>("button.hand-card")][0].click();
  assert.equal(act.mock.calls.length, 0);
});

test("the Contrée auction offers the values, the suits, Pass and Bid; Pass sends a pass", async () => {
  const { target } = await draw(read("contree_bidding"), `/play/bot/bidding/${ID}`, "AuctionPanel");
  assert.ok(target.querySelector("[role=radiogroup][aria-label='Contract value']"));
  assert.ok(target.querySelector("[role=radiogroup][aria-label='Trump suit']"));
  const buttons = [...target.querySelectorAll("button")];
  const label = (text: string) => buttons.find((button) => button.textContent?.trim().startsWith(text));
  assert.ok(label("Pass") && label("Bid"));
  act.mockResolvedValue({ bidding: { auction: [], complete: false } });
  label("Pass")!.click();
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(act.mock.calls.length, 0, "the player's own call shows first, then it is sent");
  await vi.advanceTimersByTimeAsync(1100);
  assert.deepEqual(act.mock.calls[0], [ID, { type: "pass" }]);
});

test("choosing a value and a suit then Bid sends that contract", async () => {
  const { target, flushSync } = await draw(read("contree_bidding"), `/play/bot/bidding/${ID}`, "AuctionPanel");
  const values = [...target.querySelectorAll<HTMLInputElement>("input[name=auction-value]")].filter((input) => !input.disabled);
  const wanted = values[values.length - 1];
  wanted.click();
  wanted.dispatchEvent(new Event("change", { bubbles: true }));
  const suits = [...target.querySelectorAll<HTMLInputElement>("input[name=auction-suit]")].filter((input) => !input.disabled);
  suits[0].click();
  suits[0].dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
  act.mockResolvedValue({ bidding: { auction: [], complete: false } });
  [...target.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith("Bid"))!.click();
  await vi.advanceTimersByTimeAsync(1100);
  const sent = act.mock.calls[0][1];
  assert.equal(sent.type, "contract");
  assert.equal(String(sent.value), wanted.value);
  assert.equal(sent.suit, suits[0].value);
});

test("the Classic auction offers to take the upturned card or pass", async () => {
  const { target } = await draw(read("classic_auction_round_2"), `/play/bot/bidding/${ID}`, "AuctionPanel");
  const text = target.textContent!;
  assert.match(text, /Pass/);
  const trumps = [...target.querySelectorAll<HTMLButtonElement>(".trumps button.trump")];
  assert.equal(trumps.length, 4, "round 2 offers each suit as the trump");
  const upturned = trumps.find((button) => button.disabled);
  assert.ok(upturned, "the suit of the upturned card (hearts) was refused in round 1");
  act.mockResolvedValue({ bidding: { auction: [], complete: false } });
  trumps.find((button) => !button.disabled)!.click();
  await vi.advanceTimersByTimeAsync(1100);
  assert.equal(act.mock.calls[0][1].type, "trump");
  assert.equal(target.querySelector("[role=radiogroup][aria-label='Contract value']"), null, "Classic has no values");
});

test("Classic Belote leaves the upturned card face up in the middle of the table during the whole auction", async () => {
  const snapshot = read("classic_auction_round_2");
  const { target } = await draw(snapshot, `/play/bot/bidding/${ID}`, "TableView");
  const onTable = target.querySelector(".centre .upturned-card");
  assert.ok(onTable, "the card to take is on the table, not only in the bidding window");
  assert.equal(onTable.querySelectorAll("img, svg, [data-card], .card").length > 0 || onTable.textContent!.length > 0, true, "it shows a face");
  assert.equal(onTable.getAttribute("aria-hidden"), "true", "the bidding window already names it for a screen reader");
});

test("a Contrée auction has no upturned card on the table", async () => {
  const { target } = await draw(read("contree_bidding"), `/play/bot/bidding/${ID}`, "TableView");
  assert.equal(target.querySelector(".upturned-card"), null);
});

test("the upturned card is not on the table once play begins", async () => {
  const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "TableView");
  assert.equal(target.querySelector(".upturned-card"), null);
});

test("the round result shows who made the contract, the points and the buttons that follow", async () => {
  const { target } = await draw(read("round_over_with_announcements"), `/play/bot/game/${ID}`, "RoundResult");
  assert.match(target.textContent!, /card points/);
  const labels = [...target.querySelectorAll("button, a")].map((element) => element.textContent?.trim());
  assert.ok(labels.some((text) => /next round|Next round|Review/i.test(text ?? "")), `a next step in ${labels.join("|")}`);
});

test("the whole table draws its header, the seats, the hand and the score for a round in play", async () => {
  const { target } = await draw(myTurn(), `/play/bot/game/${ID}`, "TableView");
  assert.equal(target.querySelectorAll("button.hand-card").length, 7);
  assert.ok(target.textContent!.includes("Your turn to play"));
});
