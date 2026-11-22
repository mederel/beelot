// The online table's event stream (US-121, US-168): a snapshot when it opens, then one event per change, with the table's
// state on the last event of a batch. EventSource cannot send a header, and a URL reaches proxy logs, so the URL carries a
// single-use ticket, never the player token; every reconnection asks for a new one. When the stream drops and the browser
// has not reopened it within 10 s, it is opened again after 1, 2, 4… up to 30 s. The gaps show the connection note after
// 3 s, "Reconnect now" after 10 s, and when the stream is back, the line that counts the moves missed (US-142, US-163).
import { api, latestSnapshots, rememberSnapshot, tableToken, watchStreamDrop } from "$lib/api/client";
import { localized } from "$lib/i18n/i18n.svelte";
import { makeGapTracker } from "$lib/models/reconnect";
import { streamMessage } from "$lib/models/table-events";
import type { GameEvent } from "$lib/models/game-events";
import type { Snapshot } from "$lib/api/types";
import { connection, showConnectionTrouble } from "$lib/stores/connection.svelte";

interface Handlers {
  onSnapshot: (snapshot: Snapshot) => void;
  onSpoken: (events: GameEvent[]) => void;
  onRefused: (message: string) => void;
  resync: () => Promise<void>;
}

interface Stream {
  tableId: string;
  source: EventSource | null;
  retry: number;
  timer: number | null;
  refused: boolean;
  lastEventId: number | null;
}

let current: Stream | null = null;
let handlers: Handlers | null = null;

const gaps = makeGapTracker({
  setTimer: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimer: (id: number) => window.clearTimeout(id),
  movesOf: () => (current ? latestSnapshots.get(current.tableId)?.moves : undefined),
  view: {
    note: (on: boolean) => showConnectionTrouble(on),
    button: (visible: boolean, disabled: boolean) => (connection.reconnect = { visible, disabled: Boolean(disabled) }),
    line: (line: { key: string; n: number } | null) => (connection.missed = line)
  }
});
watchStreamDrop(() => gaps.isDropped());

export function closeTableStream({ keepNote = false } = {}): void {
  if (!current) return;
  if (current.timer !== null) window.clearTimeout(current.timer);
  current.source?.close();
  current = null;
  if (!keepNote) gaps.cleared();
}

export function openTableStream(tableId: string, with_: Handlers, retry = 1000, previousId: number | null = null): void {
  handlers = with_;
  if (current?.tableId === tableId) return;
  closeTableStream();
  if (!tableToken(tableId)) return;
  const stream: Stream = { tableId, source: null, retry, timer: null, refused: false, lastEventId: previousId };
  current = stream;
  const reopen = () => {
    if (current !== stream || stream.refused || !handlers) return;
    closeTableStream({ keepNote: true });
    openTableStream(tableId, handlers, Math.min(stream.retry * 2, 30000), stream.lastEventId);
  };
  api.streamTicket(tableId).then(
    ({ ticket }) => {
      if (current !== stream) return;
      const last = stream.lastEventId ? `&lastEventId=${stream.lastEventId}` : "";
      attach(stream, new EventSource(`/api/tables/${tableId}/events?ticket=${encodeURIComponent(ticket)}&events=1${last}`), reopen);
    },
    () => {
      if (current !== stream) return;
      gaps.failed();
      stream.timer = window.setTimeout(reopen, stream.retry);
    }
  );
}

function attach(stream: Stream, source: EventSource, reopen: () => void): void {
  stream.source = source;
  source.addEventListener("open", () => {
    if (stream.timer !== null) window.clearTimeout(stream.timer);
    stream.retry = 1000;
    // Back after a drop: what happened meanwhile is read again at once, and the moves missed are counted from that read.
    const ticket = gaps.opened();
    if (ticket && handlers) handlers.resync().then(() => gaps.announce(ticket, latestSnapshots.get(stream.tableId)?.moves));
  });
  const received = (event: MessageEvent) => {
    const message = streamMessage(event.type, event.data, event.lastEventId);
    if (message.id) stream.lastEventId = message.id;
    handlers?.onSpoken(message.spoken);
    if (!message.state) return;
    rememberSnapshot(message.state);
    if (current === stream) handlers?.onSnapshot(message.state);
  };
  source.addEventListener("snapshot", received as EventListener);
  source.addEventListener("event", received as EventListener);
  source.addEventListener("error", (event) => {
    const data = (event as MessageEvent).data;
    if (data) {
      // The server refused the stream: a bot keeps the seat.
      stream.refused = true;
      source.close();
      gaps.cleared();
      const body = JSON.parse(data);
      handlers?.onRefused(localized(body, body.message));
      return;
    }
    gaps.failed();
    if (stream.timer !== null) window.clearTimeout(stream.timer);
    stream.timer = window.setTimeout(
      () => {
        if (source.readyState !== EventSource.OPEN) reopen();
      },
      source.readyState === EventSource.CLOSED ? stream.retry : 10000
    );
  });
}

// "Reconnect now": the stream is opened again at once, with the first pause, and the table is read fresh.
export function reconnectNow(): void {
  const stream = current;
  if (!stream || !handlers) return;
  gaps.reconnectRequested();
  closeTableStream({ keepNote: true });
  openTableStream(stream.tableId, handlers);
  handlers.resync();
}
