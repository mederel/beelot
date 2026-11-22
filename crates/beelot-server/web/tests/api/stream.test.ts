// The online table's event stream: a ticket per connection, the numbered events, the refusal, the reopening with growing
// pauses and the gap note, and "Reconnect now".
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const api = { streamTicket: vi.fn() };
const latestSnapshots = new Map<string, any>();
vi.mock("$lib/api/client", () => ({
  api,
  latestSnapshots,
  rememberSnapshot: (snapshot: any) => (latestSnapshots.set(snapshot.tableId, snapshot), snapshot),
  tableToken: (id: string) => (id === "t" ? "token" : null),
  watchStreamDrop: vi.fn()
}));

class FakeSource {
  static all: FakeSource[] = [];
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 0;
  listeners: Record<string, ((event: any) => void)[]> = {};
  closed = false;
  constructor(public url: string) {
    FakeSource.all.push(this);
  }
  addEventListener(name: string, callback: (event: any) => void) {
    (this.listeners[name] ??= []).push(callback);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(name: string, init: Record<string, unknown> = {}) {
    for (const callback of this.listeners[name] ?? []) callback({ type: name, data: "", lastEventId: "", ...init });
  }
}

const handlers = () => ({ onSnapshot: vi.fn(), onSpoken: vi.fn(), onRefused: vi.fn(), resync: vi.fn(async () => {}) });
const flush = () => vi.advanceTimersByTimeAsync(0);
let stream: typeof import("$lib/../table/stream");
let connection: typeof import("$lib/stores/connection.svelte").connection;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeSource);
  FakeSource.all = [];
  latestSnapshots.clear();
  api.streamTicket.mockReset();
  api.streamTicket.mockResolvedValue({ ticket: "tk 1" });
  vi.resetModules();
  stream = await import("../../src/table/stream");
  connection = (await import("$lib/stores/connection.svelte")).connection;
  connection.trouble = false;
  connection.missed = null;
  connection.reconnect = { visible: false, disabled: false };
});

afterEach(() => {
  stream.closeTableStream();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the stream is opened with a single-use ticket in the URL, never the player token", async () => {
  stream.openTableStream("t", handlers());
  await flush();
  assert.equal(FakeSource.all.length, 1);
  assert.equal(FakeSource.all[0].url, "/api/tables/t/events?ticket=tk%201&events=1");
  assert.ok(!FakeSource.all[0].url.includes("token"));
});

test("a table the player has no seat at is not streamed, and the same table is not opened twice", async () => {
  stream.openTableStream("other", handlers());
  await flush();
  assert.equal(FakeSource.all.length, 0);
  stream.openTableStream("t", handlers());
  stream.openTableStream("t", handlers());
  await flush();
  assert.equal(api.streamTicket.mock.calls.length, 1);
});

test("a snapshot and the events reach the table: the state, the spoken line and the last id", async () => {
  const h = handlers();
  stream.openTableStream("t", h);
  await flush();
  const source = FakeSource.all[0];
  source.emit("snapshot", { data: JSON.stringify({ tableId: "t", version: 1, moves: 0 }), lastEventId: "7" });
  assert.equal(h.onSnapshot.mock.calls[0][0].version, 1);
  source.emit("event", { data: JSON.stringify({ type: "card", player: "North", card: "AH", seq: 8, state: { tableId: "t", version: 2, moves: 1 } }) });
  assert.deepEqual(h.onSpoken.mock.calls.at(-1)![0], [{ type: "card", player: "North", card: "AH" }]);
  assert.equal(h.onSnapshot.mock.calls.at(-1)![0].version, 2);
  assert.equal(latestSnapshots.get("t").version, 2);
  // An event without a state (a seat joining) tells the table nothing to redraw.
  source.emit("event", { data: JSON.stringify({ type: "joined", seq: 9 }) });
  assert.equal(h.onSnapshot.mock.calls.length, 2);
});

test("a refusal by the server closes the stream for good and says why", async () => {
  const h = handlers();
  stream.openTableStream("t", h);
  await flush();
  const source = FakeSource.all[0];
  source.emit("error", { data: JSON.stringify({ message: "A bot took your seat" }) });
  assert.equal(source.closed, true);
  assert.deepEqual(h.onRefused.mock.calls, [["A bot took your seat"]]);
  await vi.advanceTimersByTimeAsync(60000);
  assert.equal(FakeSource.all.length, 1);
});

test("a dropped stream is reopened with a new ticket, the last event id, and a doubled pause", async () => {
  const h = handlers();
  stream.openTableStream("t", h);
  await flush();
  const first = FakeSource.all[0];
  first.emit("event", { data: JSON.stringify({ type: "joined", seq: 12 }) });
  first.readyState = 2;
  first.emit("error");
  await vi.advanceTimersByTimeAsync(999);
  assert.equal(FakeSource.all.length, 1);
  await vi.advanceTimersByTimeAsync(1);
  await flush();
  assert.equal(FakeSource.all.length, 2);
  assert.equal(first.closed, true);
  assert.match(FakeSource.all[1].url, /&lastEventId=12$/);
  assert.equal(api.streamTicket.mock.calls.length, 2);
  // The second drop waits twice as long.
  FakeSource.all[1].readyState = 2;
  FakeSource.all[1].emit("error");
  await vi.advanceTimersByTimeAsync(1999);
  assert.equal(FakeSource.all.length, 2);
  await vi.advanceTimersByTimeAsync(1);
  await flush();
  assert.equal(FakeSource.all.length, 3);
});

test("a stream the browser is reopening itself is given ten seconds before the page does it", async () => {
  stream.openTableStream("t", handlers());
  await flush();
  const source = FakeSource.all[0];
  source.readyState = 0;
  source.emit("error");
  await vi.advanceTimersByTimeAsync(9999);
  assert.equal(FakeSource.all.length, 1);
  await vi.advanceTimersByTimeAsync(1);
  await flush();
  assert.equal(FakeSource.all.length, 2);
});

test("the gap shows the note after 3 s and the button after 10 s; when it is back the table is read again", async () => {
  const h = handlers();
  stream.openTableStream("t", h);
  await flush();
  const source = FakeSource.all[0];
  source.emit("open");
  latestSnapshots.set("t", { tableId: "t", version: 1, moves: 4 });
  source.readyState = 0;
  source.emit("error");
  await vi.advanceTimersByTimeAsync(3000);
  assert.equal(connection.trouble, true);
  assert.equal(connection.reconnect.visible, false);
  await vi.advanceTimersByTimeAsync(7000);
  assert.equal(connection.reconnect.visible, true);
  source.emit("open");
  assert.equal(h.resync.mock.calls.length, 1);
  latestSnapshots.set("t", { tableId: "t", version: 3, moves: 6 });
  await flush();
  assert.deepEqual(connection.missed, { key: "You missed {n} moves", n: 2 });
  assert.equal(connection.trouble, false);
});

test("a ticket that cannot be had shows the trouble and tries again after the pause", async () => {
  api.streamTicket.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ ticket: "tk2" });
  stream.openTableStream("t", handlers());
  await flush();
  assert.equal(FakeSource.all.length, 0);
  await vi.advanceTimersByTimeAsync(3000);
  assert.equal(connection.trouble, true);
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  assert.equal(FakeSource.all.length, 1);
});

test("Reconnect now opens the stream again at once and reads the table fresh", async () => {
  const h = handlers();
  stream.openTableStream("t", h);
  await flush();
  const first = FakeSource.all[0];
  stream.reconnectNow();
  await flush();
  assert.equal(first.closed, true);
  assert.equal(FakeSource.all.length, 2);
  assert.equal(h.resync.mock.calls.length, 1);
});

test("closing the stream closes the source, and Reconnect now with no stream does nothing", async () => {
  stream.reconnectNow();
  assert.equal(api.streamTicket.mock.calls.length, 0);
  stream.openTableStream("t", handlers());
  await flush();
  stream.closeTableStream();
  assert.equal(FakeSource.all[0].closed, true);
});
