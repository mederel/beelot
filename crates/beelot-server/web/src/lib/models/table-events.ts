// The numbered events of an online table's stream (US-168): what the server says happened, in the shape the live region
// words. The server sends public events only; the view of the table comes with the last event of a batch.
import type { Snapshot } from "$lib/api/types";
import type { GameEvent } from "./game-events";

// The announcement of a stream event, or null for an event that is not spoken (a seat joining, a deal, ...).
export function spokenEvent(event: any): GameEvent | null {
  if (event.type === "call") return { type: "call", player: event.player, call: event.callCode };
  if (event.type === "card") return { type: "card", player: event.player, card: event.card };
  if (event.type === "trick" && event.winner) return { type: "trick", winner: event.winner };
  if (event.type === "round") return { type: "round", made: Boolean(event.made) };
  if (event.type === "match") return { type: "match", winner: event.winner };
  return null;
}

// Reads a message of the stream: the number it carries, and the table's view when it has one.
export function streamMessage(name: string, data: string, lastEventId: string): { id: number | null; state: Snapshot | null; spoken: GameEvent[] } {
  const message = JSON.parse(data);
  if (name === "snapshot") return { id: Number(lastEventId) || null, state: message, spoken: [] };
  const spoken = spokenEvent(message);
  return { id: message.seq ?? null, state: message.state ?? null, spoken: spoken ? [spoken] : [] };
}
