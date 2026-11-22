// What a screen reader is told as the game goes on (US-074): the difference between two renderings of a table, as
// structured events. No DOM, no translation: the table words them.
import type { Bidding, Board, Card, Match } from "$lib/api/types";
import type { Coded } from "$lib/i18n/types";
import { callKey } from "./contract-badge";

export type GameView =
  | { kind: "auction"; calls: { player: string; call: Coded | null }[] }
  | {
      kind: "play";
      tricks: number;
      trick: { player: string; card: Card }[];
      winner: string | null;
      round: { made: boolean } | null;
      matchWinner: string | null;
    };

export type GameEvent =
  | { type: "call"; player: string; call: Coded | null }
  | { type: "card"; player: string; card: Card }
  | { type: "trick"; winner: string }
  | { type: "round"; made: boolean }
  | { type: "match"; winner: string };

export function auctionView(bidding: Pick<Bidding, "auction">): GameView {
  return { kind: "auction", calls: (bidding.auction ?? []).map((entry) => ({ player: entry.playerName, call: entry.callCode })) };
}

export function playView(board: Board, match: Match | null | undefined): GameView {
  const seats = board.seats;
  const leader = (board.activePlayerIndex - board.currentTrick.length + seats.length) % seats.length;
  return {
    kind: "play",
    tricks: board.completedTricks,
    trick: board.currentTrick.map((card, index) => ({ player: seats[(leader + index) % seats.length].name, card })),
    winner: board.reviewingCompletedTrick ? board.trickWinner : null,
    round: board.roundResult ? { made: Boolean(board.roundResult.contractMade) } : null,
    matchWinner: match?.complete ? match.winner : null
  };
}

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

export function gameEvents(previous: GameView | null, next: GameView): GameEvent[] {
  if (!previous || previous.kind !== next.kind) return [];
  if (next.kind === "auction" && previous.kind === "auction") {
    const extends_ =
      previous.calls.length <= next.calls.length &&
      previous.calls.every((entry, index) => entry.player === next.calls[index].player && callKey(entry.call) === callKey(next.calls[index].call));
    return extends_ ? next.calls.slice(previous.calls.length).map((entry) => ({ type: "call" as const, ...entry })) : [];
  }
  if (next.kind !== "play" || previous.kind !== "play") return [];
  const events: GameEvent[] = [];
  const extension =
    previous.trick.length <= next.trick.length && previous.trick.every((entry, index) => entry.player === next.trick[index].player && sameCard(entry.card, next.trick[index].card));
  const fresh = extension ? next.trick.slice(previous.trick.length) : next.trick;
  fresh.forEach((entry) => events.push({ type: "card", player: entry.player, card: entry.card }));
  if (next.winner && (previous.winner !== next.winner || previous.tricks !== next.tricks)) events.push({ type: "trick", winner: next.winner });
  if (next.round && !previous.round) events.push({ type: "round", made: next.round.made });
  if (next.matchWinner && !previous.matchWinner) events.push({ type: "match", winner: next.matchWinner });
  return events;
}
