// Tracks the current contract (who holds it, its value, trump and coinche) from the calls of an auction or from a board,
// so the page can show a badge at the bidder's seat. A call is the `callCode` the server sends, `{ code, params }`
// (US-170); the English `call` is not read.
import type { Board, Call } from "$lib/api/types";
import type { Coded } from "$lib/i18n/types";

export interface ContractView {
  player: string;
  value: number | null;
  suit: string;
  coinched: boolean;
}

export type CallKind = "pass" | "coinche" | "bid" | "trump";

const CALL_KINDS: Record<string, CallKind> = { "call-pass": "pass", "call-coinche": "coinche", "call-bid": "bid", "call-trump": "trump" };

// What a call is: "pass", "coinche", "bid" or "trump" (the suit chosen after the upturned card); null for no call.
export function callKind(call: Coded | null | undefined): CallKind | null {
  return (call?.code && CALL_KINDS[call.code]) || null;
}

// Two calls are the same call when their keys are equal.
export function callKey(call: Coded | null | undefined): string {
  return call ? `${call.code}|${call.params?.value ?? ""}|${call.params?.trump ?? ""}` : "";
}

// Applies one call to the contract and returns the new contract.
export function contractAfterCall(contract: ContractView | null, player: string, call: Coded | null | undefined): ContractView | null {
  switch (callKind(call)) {
    case "coinche":
      return contract ? { ...contract, coinched: true } : contract;
    case "bid":
      return { player, value: Number(call!.params!.value), suit: call!.params!.trump, coinched: false };
    case "trump":
      return { player, value: null, suit: call!.params!.trump, coinched: false };
    default:
      return contract;
  }
}

// Folds the calls of an auction, in order, into the contract they leave.
export function contractFromAuction(calls: Call[]): ContractView | null {
  return calls.reduce<ContractView | null>((contract, { playerName, callCode }) => contractAfterCall(contract, playerName, callCode), null);
}

// Reads the contract of a board, or null when no one has declared.
export function contractFromBoard(board: Pick<Board, "declaringPlayerIndex" | "seats" | "variant" | "contractValue" | "trump" | "coinched">): ContractView | null {
  const index = board.declaringPlayerIndex;
  if (index == null || index < 0) return null;
  return {
    player: board.seats[index].name,
    value: board.variant === "CONTREE" ? board.contractValue : null,
    suit: board.trump,
    coinched: Boolean(board.coinched)
  };
}
