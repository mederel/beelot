// US-193: `apiResponse`, the wrapper's sibling for the requests whose answer is not JSON or whose status the caller reads
// (export, delete, sign-out, the passkey ceremony), and the one reader of the CSRF cookie.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { apiResponse, watchStreamDrop } from "$lib/api/client";
import { csrfToken } from "$lib/api/csrf";
import { connection } from "$lib/stores/connection.svelte";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  connection.trouble = false;
  watchStreamDrop(() => false);
  document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("apiResponse gives the answer whatever its status, echoes the CSRF cookie and clears the connection note", async () => {
  connection.trouble = true;
  document.cookie = "XSRF-TOKEN=tok";
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const response = await apiResponse("/api/account", { method: "DELETE" });
  assert.equal(response.status, 204);
  assert.deepEqual(fetchMock.mock.calls[0][1].headers, { "X-XSRF-TOKEN": "tok" });
  assert.equal(connection.trouble, false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply({ reason: "reauthenticate" }, 403))
  );
  assert.equal((await apiResponse("/api/account", { method: "DELETE" })).status, 403);
});

test("apiResponse shares the wrapper's retries, error and connection note", async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError("offline");
  });
  vi.stubGlobal("fetch", fetchMock);
  const read = apiResponse("/api/account/export").catch((error) => error);
  await vi.advanceTimersByTimeAsync(500 + 1500 + 3500);
  const failure = await read;
  assert.equal(fetchMock.mock.calls.length, 4, "a read is retried like apiJson's");
  assert.equal(failure.network, true);
  assert.equal(failure.message, "The connection is slow or lost.");
  assert.equal(connection.trouble, true);
  fetchMock.mockClear();
  await apiResponse("/api/sign-out", { method: "POST" }).catch(() => {});
  assert.equal(fetchMock.mock.calls.length, 1, "a write is not retried");
});

test("a request with no answer in 12 seconds is given up", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))))
  );
  const post = apiResponse("/api/x", { method: "POST" }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(12000);
  assert.equal((await post).network, true);
});

test("the CSRF cookie is read by one function, for the wrapper and for the telemetry", () => {
  assert.equal(csrfToken("a=1; XSRF-TOKEN=a%2Bb; c=2"), "a+b");
  assert.equal(csrfToken("XSRF-TOKEN=first"), "first");
  assert.equal(csrfToken("OTHER-XSRF-TOKEN=x"), null);
  assert.equal(csrfToken("XSRF-TOKEN=plain; __Host-XSRF-TOKEN=prefixed"), "prefixed");
  assert.equal(csrfToken("__Host-XSRF-TOKEN=prefixed"), "prefixed");
  assert.equal(csrfToken(""), null);
});
