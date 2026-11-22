// The goals and streaks, the friends polling and the live region: the stores that talk to the API and the sound kit.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const play = vi.fn();
const apiJson = vi.fn();
vi.mock("$lib/audio/sfx", () => ({ sfx: { play, setEnabled: vi.fn(), enabled: () => true } }));
vi.mock("$lib/api/client", () => ({ apiJson, tableRequest: (method: string, body?: unknown) => ({ method, body }) }));

const goalsModule = () => import("$lib/stores/goals.svelte");
const friendsModule = () => import("$lib/stores/friends.svelte");

beforeEach(() => {
  localStorage.clear();
  play.mockReset();
  apiJson.mockReset();
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

test("a guest's goals come from the device and a first win is celebrated once, then remembered", async () => {
  const { goals, goalOutcome, loadGoals } = await goalsModule();
  await loadGoals(false);
  assert.equal(goals.ledger?.played, 0);
  const first = goalOutcome("match-1", true, true);
  assert.equal(first?.celebration, "firstWin");
  assert.equal(goals.ledger?.won, 1);
  assert.equal(JSON.parse(localStorage.getItem("beelot.goals")!).played, 1);
  assert.equal(goalOutcome("match-1", true, true), first, "the same match is not counted twice");
  assert.equal(goals.ledger?.played, 1);
});

test("coming back to a finished match celebrates nothing", async () => {
  const { goalOutcome, loadGoals } = await goalsModule();
  await loadGoals(false);
  assert.equal(goalOutcome("old", true, false)?.celebration, null);
});

test("nothing is said while the ledger is unknown", async () => {
  const { goalOutcome, goalText, goals } = await goalsModule();
  assert.equal(goalText(null), "");
  assert.equal(goals.ledger, null);
  assert.equal(goalOutcome("x", true, true), null);
});

test("ten wins unlock the Grove and Velvet themes and announce the first", async () => {
  const { goals, loadGoals } = await goalsModule();
  const live = await import("$lib/stores/live.svelte");
  localStorage.setItem("beelot.goals", JSON.stringify({ played: 10, won: 10, results: [], seen: [] }));
  await loadGoals(false);
  assert.equal(goals.unlockedNow, "forest");
  assert.ok(play.mock.calls.some(([name]) => name === "unlock"));
  assert.deepEqual(JSON.parse(localStorage.getItem("beelot.unlocked-themes")!).sort(), ["forest", "ruby"]);
  await vi.advanceTimersByTimeAsync(0);
  assert.match(live.live.game, /Grove/);
});

test("a signed-in player's goals come from the statistics, a lost fetch leaves them unknown, and a live result refetches", async () => {
  const { goals, goalOutcome, loadGoals } = await goalsModule();
  apiJson.mockResolvedValueOnce({ overall: { played: 3, won: 2 }, recentMatches: [{ won: true, endedAt: "2026-01-02T10:00:00Z" }] });
  await loadGoals(true);
  assert.equal(goals.ledger?.played, 3);
  assert.equal(goalOutcome("m", true, true)?.celebration, null, "not a first game");
  assert.equal(goals.ledger?.played, 3, "the server records it; the ledger is only previewed");
  apiJson.mockRejectedValueOnce(new Error("down"));
  await vi.advanceTimersByTimeAsync(1500);
  assert.equal(goals.ledger, null);
});

test("friends are loaded, an invitation shows once with a sound, and a malformed answer clears the list", async () => {
  const { friends, loadFriends, dismissInvite } = await friendsModule();
  const data = { code: "ABC", friends: [], requests: [], invites: [{ id: "i1", from: "Zoé", code: "XYZ123" }] };
  apiJson.mockResolvedValueOnce(data);
  await loadFriends();
  assert.equal(friends.invite?.id, "i1");
  assert.deepEqual(play.mock.calls, [["invite"]]);
  apiJson.mockResolvedValueOnce(data);
  friends.invite = null;
  await loadFriends();
  assert.equal(friends.invite, null, "an invitation already shown is not shown again");
  apiJson.mockResolvedValueOnce({ nonsense: true });
  await loadFriends();
  assert.equal(friends.data, null);
  apiJson.mockRejectedValueOnce(new Error("offline"));
  await loadFriends();
  assert.equal(friends.data, null);
  apiJson.mockResolvedValue({});
  friends.invite = { id: "i1", from: "Zoé", code: "XYZ123" };
  dismissInvite(friends.invite);
  assert.equal(friends.invite, null);
  assert.deepEqual(apiJson.mock.calls.at(-1), ["/api/invites/i1", { method: "DELETE" }]);
});

test("friends are polled every twenty seconds while signed in, and stop with the session", async () => {
  const { friends, startFriendsPolling } = await friendsModule();
  apiJson.mockResolvedValue({ code: "A", friends: [], requests: [], invites: [] });
  startFriendsPolling(true);
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(apiJson.mock.calls.length, 1);
  await vi.advanceTimersByTimeAsync(40000);
  assert.equal(apiJson.mock.calls.length, 3);
  startFriendsPolling(false);
  assert.equal(friends.data, null);
  await vi.advanceTimersByTimeAsync(60000);
  assert.equal(apiJson.mock.calls.length, 3);
});

test("friend actions and invitations go through the API, and an action reloads the list", async () => {
  const { friendAction, inviteFriend } = await friendsModule();
  apiJson.mockResolvedValue({ code: "A", friends: [], requests: [], invites: [] });
  await friendAction("POST", "/api/friends/7/accept");
  assert.deepEqual(apiJson.mock.calls[0], ["/api/friends/7/accept", { method: "POST" }]);
  assert.equal(apiJson.mock.calls[1][0], "/api/friends");
  await inviteFriend("t1", "f9");
  assert.deepEqual(apiJson.mock.calls.at(-1), ["/api/tables/t1/invite", { method: "POST", body: { friendId: "f9" } }]);
});

test("the live region speaks the same sentence again by clearing it first, and ignores an empty one", async () => {
  vi.useRealTimers();
  const { announce, live } = await import("$lib/stores/live.svelte");
  announce("Your turn");
  assert.equal(live.game, "");
  await Promise.resolve();
  assert.equal(live.game, "Your turn");
  announce("");
  assert.equal(live.game, "Your turn");
});
