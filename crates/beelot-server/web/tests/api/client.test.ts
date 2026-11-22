// The page's requests: the CSRF echo, the timeout, the read retries, the error shapes, the table tokens and the recovery of
// a move whose answer was lost.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { ApiError, api, apiJson, forgetTableSession, getPrivateSession, jsonBody, latestSnapshots, rememberSnapshot, setPrivateSession, tableRequest, tableToken, tableTokens, watchStreamDrop, withCsrfToken } from "$lib/api/client";
import { connection } from "$lib/stores/connection.svelte";
import type { Snapshot } from "$lib/api/types";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const snapshot = (tableId: string, version: number) => ({ tableId, version }) as unknown as Snapshot;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  latestSnapshots.clear();
  connection.trouble = false;
  watchStreamDrop(() => false);
  document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a state-changing request echoes the CSRF cookie, a read does not", () => {
  document.cookie = "XSRF-TOKEN=a%2Bb";
  const post = withCsrfToken({ method: "post", headers: { "Content-Type": "application/json" } });
  assert.deepEqual(post.headers, { "Content-Type": "application/json", "X-XSRF-TOKEN": "a+b" });
  assert.deepEqual(withCsrfToken({ method: "GET" }), { method: "GET" });
  assert.deepEqual(withCsrfToken(), {});
});

test("without a cookie the request is left as it is", () => {
  const options = { method: "POST" };
  assert.equal(withCsrfToken(options), options);
});

test("jsonBody and tableRequest build the JSON body and the player's bearer token", () => {
  assert.deepEqual(jsonBody({ a: 1 }), { headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  sessionStorage.setItem("beelot.table-tokens", JSON.stringify({ t1: "secret" }));
  assert.deepEqual(tableRequest("POST", { x: 1 }, "t1"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer secret" }, body: '{"x":1}' });
  assert.deepEqual(tableRequest("GET", undefined, "unknown"), { method: "GET", headers: {}, body: undefined });
});

test("a good answer is returned and clears the connection note", async () => {
  connection.trouble = true;
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: 1 })));
  assert.deepEqual(await apiJson("/api/x"), { ok: 1 });
  assert.equal(connection.trouble, false);
});

test("a coded error carries the server's message, status and body; an uncoded one gets a generic text", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ code: "no.such.code", message: "Not your turn" }, 409)));
  const failure = await apiJson("/api/x", { method: "POST" }).catch((error) => error);
  assert.ok(failure instanceof ApiError);
  assert.equal(failure.status, 409);
  assert.equal(failure.network, false);
  assert.equal(failure.body.message, "Not your turn");
  vi.stubGlobal("fetch", vi.fn(async () => reply({}, 400)));
  const generic = await apiJson("/api/x", { method: "POST" }).catch((error) => error);
  assert.equal(generic.message, "Something went wrong. Please try again.");
});

test("a gateway error is a connection problem, and shows the note", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({}, 502)));
  const failure = await apiJson("/api/x", { method: "POST" }).catch((error) => error);
  assert.equal(failure.network, true);
  assert.equal(failure.status, 502);
  assert.equal(connection.trouble, true);
});

test("a read is retried after 0.5, 1.5 and 3.5 s, then fails; a write is not retried", async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError("offline");
  });
  vi.stubGlobal("fetch", fetchMock);
  const read = apiJson("/api/x").catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(fetchMock.mock.calls.length, 1);
  await vi.advanceTimersByTimeAsync(500);
  assert.equal(fetchMock.mock.calls.length, 2);
  await vi.advanceTimersByTimeAsync(1500);
  assert.equal(fetchMock.mock.calls.length, 3);
  await vi.advanceTimersByTimeAsync(3500);
  const failure = await read;
  assert.equal(fetchMock.mock.calls.length, 4);
  assert.equal(failure.network, true);
  assert.equal(failure.message, "The connection is slow or lost.");
  fetchMock.mockClear();
  await apiJson("/api/x", { method: "POST" }).catch(() => {});
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("a retry that works returns its answer", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(reply({ back: true }));
  vi.stubGlobal("fetch", fetchMock);
  const read = apiJson("/api/x");
  await vi.advanceTimersByTimeAsync(500);
  assert.deepEqual(await read, { back: true });
});

test("a request with no answer in 12 seconds is given up", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))))
  );
  const post = apiJson("/api/x", { method: "POST" }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(12000);
  assert.equal((await post).network, true);
});

test("while the live link is down an answer does not clear the note", async () => {
  connection.trouble = true;
  watchStreamDrop(() => true);
  vi.stubGlobal("fetch", vi.fn(async () => reply({})));
  await apiJson("/api/x");
  assert.equal(connection.trouble, true);
});

test("a table's tokens are kept for the tab and forgotten with the seat", () => {
  sessionStorage.setItem("beelot.table-tokens", JSON.stringify({ a: "1", b: "2" }));
  assert.equal(tableToken("a"), "1");
  forgetTableSession("a");
  assert.deepEqual(tableTokens(), { b: "2" });
  assert.equal(tableToken("a"), null);
  sessionStorage.setItem("beelot.table-tokens", "{not json");
  assert.deepEqual(tableTokens(), {});
});

test("a seat that is remembered on the device is found when the tab has no token", () => {
  localStorage.setItem("beelot.resume", JSON.stringify({ tableId: "solo", playerToken: "device" }));
  assert.equal(tableToken("solo"), "device");
});

test("the private table's session is stored without extra fields and can be removed", () => {
  setPrivateSession({ tableId: "t", playerToken: "p", extra: 1 } as never);
  assert.deepEqual(getPrivateSession(), { tableId: "t", playerToken: "p" });
  setPrivateSession(null);
  assert.equal(getPrivateSession(), null);
});

test("only a newer or equal snapshot replaces the known one", () => {
  rememberSnapshot(snapshot("t", 5));
  rememberSnapshot(snapshot("t", 3));
  assert.equal(latestSnapshots.get("t")!.version, 5);
  rememberSnapshot(snapshot("t", 6));
  assert.equal(latestSnapshots.get("t")!.version, 6);
});

test("creating or joining a table keeps the player's token for the tab", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ tableId: "t9", playerToken: "tok" })));
  const access = await api.join("ABC123", "Zoé");
  assert.equal(access.tableId, "t9");
  assert.equal(tableToken("t9"), "tok");
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  assert.equal(url, "/api/tables/join");
  assert.equal(init.body, JSON.stringify({ code: "ABC123", playerName: "Zoé" }));
});

test("an action's answer is remembered as the newest snapshot", async () => {
  sessionStorage.setItem("beelot.table-tokens", JSON.stringify({ t: "tok" }));
  vi.stubGlobal("fetch", vi.fn(async () => reply(snapshot("t", 4))));
  const result = await api.act("t", { type: "pass" } as never);
  assert.equal(result.version, 4);
  assert.equal(latestSnapshots.get("t")!.version, 4);
  const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
  assert.deepEqual(init.headers, { "Content-Type": "application/json", Authorization: "Bearer tok" });
});

test("a move whose answer was lost counts when the table is found ahead of what was known", async () => {
  sessionStorage.setItem("beelot.table-tokens", JSON.stringify({ t: "tok" }));
  rememberSnapshot(snapshot("t", 2));
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/actions")) throw new TypeError("lost");
    return reply(snapshot("t", 3));
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await api.act("t", { type: "pass" } as never);
  assert.equal(result.version, 3);
});

test("a move whose answer was lost and did not arrive is reported as an error", async () => {
  sessionStorage.setItem("beelot.table-tokens", JSON.stringify({ t: "tok" }));
  rememberSnapshot(snapshot("t", 2));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/actions")) throw new TypeError("lost");
      return reply(snapshot("t", 2));
    })
  );
  const failure = await api.act("t", { type: "pass" } as never).catch((error) => error);
  assert.equal(failure.network, true);
});

test("a refused move is not mistaken for a lost one", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ message: "no" }, 409)));
  const failure = await api.act("t", { type: "pass" } as never).catch((error) => error);
  assert.equal(failure.status, 409);
  assert.equal(vi.mocked(fetch).mock.calls.length, 1);
});
