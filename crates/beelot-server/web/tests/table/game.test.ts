// The table's controller, driven by the server's own recorded snapshots (tests/contract): what each snapshot makes the table
// show, and what the player's actions send.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test, vi } from "vitest";

const read = (name: string) => JSON.parse(readFileSync(`../tests/contract/${name}.json`, "utf8"));

const act = vi.fn();
const table = vi.fn();
const client = {
  api: { act, table, analysis: vi.fn(async () => ({ costly: [] })), explanations: vi.fn(async () => []), hint: vi.fn(), streamTicket: vi.fn() },
  ApiError: class extends Error {
    status?: number;
    network = false;
  },
  currentSnapshot: vi.fn(),
  forgetTableSession: vi.fn(),
  setPrivateSession: vi.fn(),
  tableToken: vi.fn(() => "token")
};
vi.mock("$lib/api/client", () => client);
const stream = { openTableStream: vi.fn(), closeTableStream: vi.fn() };
vi.mock("../../src/table/stream", () => stream);
vi.mock("$lib/audio/sfx", async (original) => ({ ...(await original<object>()), sfx: { play: vi.fn(), setEnabled: vi.fn(), enabled: () => true } }));
vi.mock("$lib/fx/particles", () => ({ burst: vi.fn() }));
vi.mock("$lib/fx/haptics", async (original) => ({ ...(await original<object>()), buzz: vi.fn() }));
vi.mock("$lib/fx/flight", async (original) => ({ ...(await original<object>()), flyPacket: vi.fn(async () => {}) }));

type Game = import("../../src/table/game.svelte").TableGame;
let games: Game[] = [];
let router: typeof import("$lib/stores/router.svelte");
let module: typeof import("../../src/table/game.svelte");
let live: typeof import("$lib/stores/live.svelte");

const ID = "01234567-89ab-cdef-0123-456789abcdef";

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem("beelot.language", "en");
  sessionStorage.clear();
  [act, table, client.currentSnapshot, stream.openTableStream, stream.closeTableStream].forEach((mock) => mock.mockReset());
  window.scrollTo = vi.fn() as never;
  vi.resetModules();
  router = await import("$lib/stores/router.svelte");
  module = await import("../../src/table/game.svelte");
  live = await import("$lib/stores/live.svelte");
  games = [];
});

afterEach(() => {
  games.forEach((game) => game.destroy());
  vi.useRealTimers();
});

function open(path: string, phase: "auction" | "online" | null = null): Game {
  history.replaceState({}, "", path);
  router.router.path = path;
  const game = new module.TableGame(ID, phase);
  games.push(game);
  return game;
}

const settle = () => vi.advanceTimersByTimeAsync(20000);

test("the pure texts: a carré and a sequence are named by their rank and top card", () => {
  const card = (rank: string, suit = "HEARTS") => ({ rank, suit, symbol: "" }) as never;
  assert.equal(module.announcementName({ kind: "CARRE", cards: [card("J")], topCard: card("J") }), "Carré of jacks");
  assert.match(module.announcementName({ kind: "TIERCE", cards: [], topCard: card("K") }), /^Tierce to the /);
});

test("a round's score text lists each team's card points, dix de der and belote", () => {
  const { roundResult, ...board } = read("round_over_with_announcements").board;
  const text = module.roundScoreText(roundResult, board);
  assert.match(text, /North–South: \d+ card points \+ \d+ Dix de der \+ \d+ Belote = \d+\./);
  assert.match(text, /East–West: \d+ card points/);
});

test("a private table that is waiting for players shows the lobby with its seats", async () => {
  const snapshot = read("lobby_waiting");
  client.currentSnapshot.mockResolvedValue(snapshot);
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  assert.equal(game.stage, "lobby");
  assert.equal(game.lobby?.model.publicWaiting, false);
  assert.equal(game.seats.length, 4);
  assert.deepEqual(game.seats.slice(0, 2).map((seat) => seat.name), ["Ana", "Ben"]);
  assert.equal(game.viewer, 1);
  assert.equal(game.status, "Private table");
  assert.equal(game.hand.length, 0);
  assert.equal(stream.openTableStream.mock.calls.length, 1, "the live link is opened for an online table");
});

test("the lobby's countdown ticks for a public table that is filling with bots", async () => {
  const snapshot = read("lobby_waiting");
  snapshot.table.publicTable = true;
  snapshot.table.botFillAt = new Date(Date.now() + 30000).toISOString();
  client.currentSnapshot.mockResolvedValue(snapshot);
  const game = open(`/online/public/table/${ID}`, "online");
  await game.loadOnline();
  assert.match(game.lobby!.countdown, /bots take the empty seats in 30 s/);
  await vi.advanceTimersByTimeAsync(5000);
  assert.match(game.lobby!.countdown, / 25 s/);
});

test("an older snapshot than the one drawn is ignored", async () => {
  const snapshot = read("lobby_waiting");
  client.currentSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, version: 1, table: { ...snapshot.table, seats: [] } });
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  await game.loadOnline();
  assert.equal(game.seats[0].name, "Ana");
});

test("an online table that is gone sends the player back with a notice", async () => {
  client.currentSnapshot.mockRejectedValue(new Error("gone"));
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  assert.equal(router.router.path, "/online/private");
  const { notices } = await import("$lib/stores/notices.svelte");
  assert.equal(notices.take("/online/private"), "That table is no longer available.");
});

test("a lost connection keeps the screen and loads again after three seconds", async () => {
  const failure = Object.assign(new client.ApiError("slow"), { network: true });
  table.mockRejectedValueOnce(failure).mockResolvedValue(read("contree_bidding"));
  const game = open(`/play/bot/bidding/${ID}`, "auction");
  await game.loadSolo();
  assert.equal(router.router.path, `/play/bot/bidding/${ID}`);
  assert.equal(game.stage, "loading");
  await vi.advanceTimersByTimeAsync(3000);
  assert.equal(game.stage, "auction");
});

test("a solo auction shows the player's hand, the seats and the auction sheet", async () => {
  table.mockResolvedValue(read("contree_bidding"));
  const game = open(`/play/bot/bidding/${ID}`, "auction");
  await game.loadSolo();
  await settle();
  assert.equal(game.stage, "auction");
  assert.equal(game.hand.length, 8);
  assert.equal(game.seats.length, 4);
  assert.equal(game.seats[0].name, "You");
  assert.ok(game.auction);
  assert.equal(game.auction!.open, true);
  assert.equal(game.handLive, false, "the cards cannot be played during the auction");
  assert.equal(game.title, "Contrée");
});

test("a solo table whose snapshot has bidding but the address is for the cards is sent to the auction", async () => {
  table.mockResolvedValue(read("contree_bidding"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  assert.equal(router.router.path, `/play/bot/bidding/${ID}`);
});

test("a table that no longer exists sends a solo player to the setup", async () => {
  table.mockRejectedValue(new Error("404"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  assert.equal(router.router.path, "/play/bot");
});

test("a pass is shown at once, sent to the server, and the table is read again", async () => {
  const snapshot = read("contree_bidding");
  table.mockResolvedValue(snapshot);
  act.mockResolvedValue({ ...snapshot, bidding: { ...snapshot.bidding, auction: snapshot.bidding.auction } });
  const game = open(`/play/bot/bidding/${ID}`, "auction");
  await game.loadSolo();
  await settle();
  const before = table.mock.calls.length;
  const calling = game.bid("pass");
  assert.equal(game.auction!.busy, true);
  assert.equal(game.auction!.open, false);
  await settle();
  await calling;
  assert.deepEqual(act.mock.calls[0], [ID, { type: "pass" }]);
  assert.ok(table.mock.calls.length > before);
});

test("a refused call redraws the auction and says why", async () => {
  table.mockResolvedValue(read("contree_bidding"));
  act.mockRejectedValue(Object.assign(new client.ApiError("That call is not allowed"), { status: 409 }));
  (await import("$lib/stores/settings.svelte")).setEffects("off");
  const game = open(`/play/bot/bidding/${ID}`, "auction");
  await game.loadSolo();
  await settle();
  const calling = game.bid("contract", { suit: "HEARTS", value: 80 });
  await vi.advanceTimersByTimeAsync(1100);
  await calling;
  assert.equal(game.status, "That call is not allowed");
  assert.equal(game.auction!.busy, false);
  assert.equal(game.auction!.open, true);
});

test("a bid is sent as is at an online table, and the sheet hides until the table is redrawn", async () => {
  const snapshot = read("contree_bidding");
  snapshot.table.kind = "PRIVATE";
  client.currentSnapshot.mockResolvedValue(snapshot);
  act.mockResolvedValue(snapshot);
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  await settle();
  await game.bid("contract", { suit: "SPADES", value: 90 });
  assert.deepEqual(act.mock.calls[0], [ID, { type: "contract", suit: "SPADES", value: 90 }]);
});

test("the cards of a trick under review show the trick, the hand, and which cards can be played", async () => {
  table.mockResolvedValue(read("trick_under_review"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  assert.equal(game.stage, "play");
  assert.equal(game.trump, "Spades");
  assert.equal(game.hand.length, 7);
  assert.equal(game.completedTricks, 1);
  assert.equal(game.auction, null);
  assert.ok(game.score, "the score bar is drawn");
  assert.ok(game.contract, "the contract badge is shown");
  assert.ok(game.seats.every((seat) => seat.cardCount >= 0));
});

test("a finished round shows its result with the score of each team and the next step", async () => {
  table.mockResolvedValue(read("round_over_with_announcements"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  assert.ok(game.round);
  assert.equal(game.round!.next, true);
  assert.ok(game.round!.breakdown.includes("card points"));
  assert.equal(game.handLive, false);
});

test("the next round is asked of the server, and the player goes to the new auction", async () => {
  table.mockResolvedValue(read("round_over_with_announcements"));
  act.mockResolvedValue({});
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  await game.nextRound();
  assert.deepEqual(act.mock.calls[0], [ID, { type: "nextRound" }]);
  assert.equal(game.round, null);
  assert.equal(router.router.path, `/play/bot/bidding/${ID}`);
});

test("a rematch is asked of the server; a refusal is shown and the player stays", async () => {
  table.mockResolvedValue(read("round_over_with_announcements"));
  act.mockRejectedValue(new Error("No rematch now"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  await game.rematch();
  assert.equal(game.status, "No rematch now");
  assert.equal(router.router.path, `/play/bot/game/${ID}`);
});

test("an online next round or rematch is an action at the table", async () => {
  const snapshot = read("round_over_with_announcements");
  snapshot.table.kind = "PRIVATE";
  client.currentSnapshot.mockResolvedValue(snapshot);
  act.mockResolvedValue(snapshot);
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  await settle();
  await game.nextRound();
  await game.rematch();
  assert.deepEqual(act.mock.calls.map((call) => call[1]), [{ type: "nextRound" }, { type: "rematch" }]);
});

test("the round's review loads the analysis and the bots' reasons, and closes", async () => {
  table.mockResolvedValue(read("round_over_with_announcements"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  game.openReview();
  assert.equal(game.review?.open, true);
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(game.review?.analysis, { costly: [] });
  assert.deepEqual(game.review?.explanations, []);
  game.closeReview();
  assert.equal(game.review, null);
});

test("an action's refusal at an online table reads the table again and shows the message in the lobby", async () => {
  const snapshot = read("lobby_waiting");
  client.currentSnapshot.mockResolvedValue(snapshot);
  table.mockResolvedValue(snapshot);
  act.mockRejectedValue(Object.assign(new client.ApiError("Only the owner can start"), { status: 403 }));
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  await game.onlineAction({ type: "start" } as never);
  assert.equal(game.lobby?.message, "Only the owner can start");
  await game.onlineAction({ type: "start" } as never);
  assert.ok(table.mock.calls.length >= 1, "the table was read fresh");
});

test("leaving a public table asks the server, forgets the seat and goes to the public page", async () => {
  client.currentSnapshot.mockResolvedValue(read("lobby_waiting"));
  act.mockResolvedValue({});
  const game = open(`/online/public/table/${ID}`, "online");
  await game.loadOnline();
  await game.leavePublic();
  assert.deepEqual(act.mock.calls[0], [ID, { type: "leave" }]);
  assert.equal(stream.closeTableStream.mock.calls.length >= 1, true);
  assert.deepEqual(client.forgetTableSession.mock.calls[0], [ID]);
  assert.equal(router.router.path, "/online/public");
});

test("leaving in the middle of a solo match asks first, and confirming goes", async () => {
  table.mockResolvedValue(read("trick_under_review"));
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await settle();
  assert.equal(router.navigate("/", { confirmLeave: true }), true);
  assert.equal(game.leave.open, true);
  assert.equal(game.leave.destination, "/");
  assert.equal(router.router.path, `/play/bot/game/${ID}`, "the player has not left yet");
  game.confirmLeave();
  assert.equal(game.leave.open, false);
  assert.equal(router.router.path, "/");
});

test("destroying the table lifts the leave guard and closes the stream", async () => {
  const game = open(`/play/bot/game/${ID}`, null);
  game.destroy();
  assert.equal(router.navigate("/", { confirmLeave: true }), true);
  assert.equal(router.router.path, "/");
  assert.equal(stream.closeTableStream.mock.calls.length >= 1, true);
});

test("a message shown on the table disappears after a while", async () => {
  const game = open(`/play/bot/game/${ID}`, null);
  game.flash("Not your turn", 3000);
  assert.equal(game.status, "Not your turn");
  await vi.advanceTimersByTimeAsync(3001);
  assert.notEqual(game.status, "Not your turn");
});

// ---------------------------------------------------------------- playing a card
// The recorded trick under review, made the player's turn: an empty table, two cards that follow the rules and the rest refused.
function myTurn() {
  const snapshot = read("trick_under_review");
  const { board } = snapshot;
  board.reviewingCompletedTrick = false;
  board.currentTrick = [];
  board.trickWinner = null;
  board.legalCards = board.hand.slice(0, 2);
  board.illegalCards = board.hand.slice(2).map((card: object) => ({ card, reason: "MUST_FOLLOW", suit: "HEARTS" }));
  snapshot.table.kind = "LOCAL";
  snapshot.table.hints = true;
  snapshot.table.undoOffered = true;
  snapshot.table.undosLeft = 2;
  return snapshot;
}

async function ready(snapshot = myTurn()) {
  (await import("$lib/stores/settings.svelte")).setEffects("off");
  table.mockResolvedValue(snapshot);
  const game = open(`/play/bot/game/${ID}`, null);
  await game.loadSolo();
  await vi.advanceTimersByTimeAsync(500);
  return game;
}

test("on the player's turn the hand is live and only the cards that follow the rules can be played", async () => {
  const game = await ready();
  assert.equal(game.handLive, true);
  assert.equal(game.legal.length, 2);
  assert.equal(Object.keys(game.illegal).length, 5);
  assert.equal(game.status, "Your turn to play");
});

test("playing a legal card sends it with the declaration choice, locks the hand, and reads the table again", async () => {
  const game = await ready();
  act.mockResolvedValue({});
  const item = game.hand.find((entry) => game.legal.includes(entry.key))!;
  const reads = table.mock.calls.length;
  await game.play(item, null);
  assert.deepEqual(act.mock.calls[0], [ID, { type: "card", rank: item.card.rank, suit: item.card.suit, declare: false }]);
  assert.equal(game.handLive, false);
  assert.equal(game.playing, item.key);
  assert.ok(table.mock.calls.length > reads);
});

test("a card tapped while another is on its way is ignored", async () => {
  const game = await ready();
  act.mockResolvedValue({});
  const [first, second] = game.hand.filter((entry) => game.legal.includes(entry.key));
  await game.play(first, null);
  await game.play(second, null);
  assert.equal(act.mock.calls.length, 1);
});

test("a card that does not follow the rules explains why and sends nothing", async () => {
  const game = await ready();
  const item = game.hand.find((entry) => !game.legal.includes(entry.key))!;
  await game.play(item, null);
  assert.equal(act.mock.calls.length, 0);
  assert.equal(game.statusFlash, true);
  assert.equal(game.status, "Follow the suit led: hearts");
  assert.equal(game.handLive, true);
});

test("a move the server refuses frees the hand and says why", async () => {
  const game = await ready();
  act.mockRejectedValue(new Error("It is not your turn"));
  await game.play(game.hand.find((entry) => game.legal.includes(entry.key))!, null);
  assert.equal(game.playing, null);
  assert.equal(game.handLive, true);
  assert.equal(game.status, "It is not your turn");
});

test("a card played at an online table is an action of the table", async () => {
  const snapshot = myTurn();
  snapshot.table.kind = "PRIVATE";
  (await import("$lib/stores/settings.svelte")).setEffects("off");
  client.currentSnapshot.mockResolvedValue(snapshot);
  act.mockResolvedValue(snapshot);
  const game = open(`/online/private/table/${ID}`, "online");
  await game.loadOnline();
  await settle();
  const item = game.hand.find((entry) => game.legal.includes(entry.key))!;
  await game.play(item, null);
  assert.equal(act.mock.calls[0][1].type, "card");
  assert.equal(game.playing, null);
});

test("the position a tapped card left is given back once, if it is fresh", async () => {
  const game = await ready();
  act.mockResolvedValue({});
  const item = game.hand.find((entry) => game.legal.includes(entry.key))!;
  const from = document.createElement("div");
  from.getBoundingClientRect = () => ({ left: 5, top: 6, width: 40, height: 60 }) as DOMRect;
  await game.play(item, from);
  assert.deepEqual(game.takeOrigin(item.key), { left: 5, top: 6, width: 40, height: 60 });
  assert.equal(game.takeOrigin(item.key), null);
});

// ---------------------------------------------------------------- hints and undo
test("a hint for a card marks it and says why; a hint for a bid marks the bid", async () => {
  const game = await ready();
  assert.equal(game.hintAvailable, true);
  const key = game.legal[0];
  const [rank, suit] = [game.hand.find((entry) => entry.key === key)!.card.rank, game.hand.find((entry) => entry.key === key)!.card.suit];
  client.api.hint.mockResolvedValueOnce({ type: "card", card: { rank, suit }, reason: "TAKE_TRICK" });
  await game.askHint();
  assert.equal(game.hintCard, key);
  assert.ok(game.toast);
  game.clearHint();
  assert.equal(game.hintCard, null);
  client.api.hint.mockResolvedValueOnce({ type: "bid", action: { type: "contract", suit: "HEARTS", value: 80 }, reason: "TAKE" });
  await game.askHint();
  assert.deepEqual(game.hintBid, { type: "contract", suit: "HEARTS", value: 80 });
  assert.match(game.hintReason, /Take/);
});

test("a hint that cannot be had shows nothing new", async () => {
  const game = await ready();
  client.api.hint.mockRejectedValueOnce(new Error("no"));
  await game.askHint();
  assert.equal(game.hintCard, null);
  assert.equal(game.hintBid, null);
});

test("no hint is offered when the table does not allow them", async () => {
  const snapshot = myTurn();
  snapshot.table.hints = false;
  const game = await ready(snapshot);
  assert.equal(game.hintAvailable, false);
  await game.askHint();
  assert.equal(client.api.hint.mock.calls.length, 0);
});

test("the undo is offered for a few seconds with the undos that are left, and taking back asks the server", async () => {
  const game = await ready();
  assert.deepEqual(game.undo, { left: 2 });
  act.mockResolvedValue({});
  await game.takeBack();
  assert.deepEqual(act.mock.calls[0], [ID, { type: "undo" }]);
  assert.equal(game.undo === null || game.undo.left === 2, true);
  const fresh = await ready();
  await vi.advanceTimersByTimeAsync(60000);
  assert.equal(fresh.undo, null, "the offer goes away by itself");
});

test("no undo is offered with none left, or in pass-and-play", async () => {
  const none = myTurn();
  none.table.undosLeft = 0;
  assert.equal((await ready(none)).undo, null);
  const pass = myTurn();
  pass.table.passAndPlay = true;
  table.mockResolvedValue(pass);
  const game = open(`/play/bot/game/${ID}`, null);
  game.loadSolo(); // the cover waits for the player, so this does not finish
  await vi.advanceTimersByTimeAsync(500);
  assert.equal(game.undo, null);
});

// ---------------------------------------------------------------- reactions
test("a reaction bubble shows by its seat for four seconds and replaces the seat's previous one", async () => {
  const game = open(`/online/private/table/${ID}`, "online");
  (await import("$lib/stores/settings.svelte")).setReactions(true);
  game.showReaction(1, "GOOD_GAME");
  game.showReaction(1, "GOOD_GAME");
  assert.equal(game.bubbles.length, 1);
  assert.match(game.bubbles[0].text, /Good game!/);
  await vi.advanceTimersByTimeAsync(4001);
  assert.equal(game.bubbles.length, 0);
  game.showReaction(1, "NOT_A_REACTION");
  assert.equal(game.bubbles.length, 0);
});

test("with reactions turned off no bubble is shown", async () => {
  const game = open(`/online/private/table/${ID}`, "online");
  (await import("$lib/stores/settings.svelte")).setReactions(false);
  game.showReaction(1, "GOOD_GAME");
  assert.equal(game.bubbles.length, 0);
});

test("sending a reaction shows it at the player's own seat; a refusal is shown in the status line", async () => {
  const game = open(`/online/private/table/${ID}`, "online");
  (await import("$lib/stores/settings.svelte")).setReactions(true);
  window.matchMedia = (() => ({ matches: true })) as never;
  act.mockResolvedValueOnce({ you: 1, reactions: [{ position: 1, reaction: "GOOD_GAME", sequence: 3 }] });
  await game.react("GOOD_GAME");
  assert.equal(game.reactions.tray, true);
  assert.equal(game.bubbles[0].seat, 1);
  act.mockRejectedValueOnce(new Error("Too many reactions"));
  await game.react("GOOD_GAME");
  assert.equal(game.status, "Too many reactions");
});
