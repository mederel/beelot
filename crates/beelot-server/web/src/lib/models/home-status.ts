// What home shows about a match in progress (US-122, US-145): the resume records on this device, and the cards built from
// the tables' snapshots. No DOM, no translation.
import type { Snapshot } from "$lib/api/types";

export const RESUME_KEY = "beelot.resume";
export const ONLINE_RESUME_KEY = "beelot.resume-online";
const ONLINE_RESUME_MAX = 3;

export interface ResumeRecord {
  tableId: string;
  playerToken: string;
}

export function readResume(storage: Storage): ResumeRecord | null {
  try {
    const record = JSON.parse(storage.getItem(RESUME_KEY) ?? "null");
    return record && typeof record.tableId === "string" && typeof record.playerToken === "string" ? record : null;
  } catch {
    return null;
  }
}

export function rememberResume(storage: Storage, tableId: string, playerToken: string | null | undefined): void {
  if (!tableId || !playerToken) return;
  try {
    storage.setItem(RESUME_KEY, JSON.stringify({ tableId, playerToken }));
  } catch {
    /* the match is not remembered */
  }
}

export function forgetResume(storage: Storage): void {
  try {
    storage.removeItem(RESUME_KEY);
  } catch {
    /* nothing to forget */
  }
}

export interface ResumeCard {
  path: string;
  variantLabel: string;
  yours: number;
  theirs: number;
  target: number;
}

// The card of a solo match in progress, or null when there is nothing to resume.
export function resumeCard(snapshot: Snapshot | null | undefined): ResumeCard | null {
  if (!snapshot?.table || snapshot.table.kind !== "LOCAL" || snapshot.table.passAndPlay) return null;
  if (snapshot.match?.complete || (!snapshot.board && !snapshot.bidding)) return null;
  const mine = (snapshot.you ?? 0) % 2 === 0;
  const match = snapshot.match ?? { northSouth: 0, eastWest: 0, target: 1000 };
  return {
    path: snapshot.board ? `/play/bot/game/${snapshot.tableId}` : `/play/bot/bidding/${snapshot.tableId}`,
    variantLabel: snapshot.table.variantLabel,
    yours: mine ? match.northSouth : match.eastWest,
    theirs: mine ? match.eastWest : match.northSouth,
    target: match.target
  };
}

export function readOnlineResumes(storage: Storage): ResumeRecord[] {
  try {
    const list = JSON.parse(storage.getItem(ONLINE_RESUME_KEY) ?? "null");
    if (!Array.isArray(list)) return [];
    return list.filter((r) => r && typeof r.tableId === "string" && typeof r.playerToken === "string").slice(0, ONLINE_RESUME_MAX);
  } catch {
    return [];
  }
}

function writeOnlineResumes(storage: Storage, list: ResumeRecord[]): void {
  try {
    if (list.length) storage.setItem(ONLINE_RESUME_KEY, JSON.stringify(list));
    else storage.removeItem(ONLINE_RESUME_KEY);
  } catch {
    /* the match is not remembered */
  }
}

// The table goes first; an older record of the same table is replaced; beyond three the oldest is dropped.
export function rememberOnlineResume(storage: Storage, tableId: string, playerToken: string | null | undefined): void {
  if (!tableId || !playerToken) return;
  const others = readOnlineResumes(storage).filter((r) => r.tableId !== tableId);
  writeOnlineResumes(storage, [{ tableId, playerToken }, ...others].slice(0, ONLINE_RESUME_MAX));
}

export function forgetOnlineResume(storage: Storage, tableId: string): void {
  writeOnlineResumes(storage, readOnlineResumes(storage).filter((r) => r.tableId !== tableId));
}

export interface OnlineResumeCard extends ResumeCard {
  tableId: string;
  waiting: boolean;
}

// The card of an online match in which the viewer holds a seat, or null: a spectator, a solo or pass-and-play table, or a
// match that is over.
export function onlineResumeCard(snapshot: Snapshot | null | undefined): OnlineResumeCard | null {
  const kind = snapshot?.table?.kind;
  if (!snapshot || (kind !== "PRIVATE" && kind !== "PUBLIC") || snapshot.you === null || snapshot.you === undefined) return null;
  if (snapshot.match?.complete) return null;
  const mine = snapshot.you % 2 === 0;
  const match = snapshot.match ?? { northSouth: 0, eastWest: 0, target: 1000 };
  return {
    tableId: snapshot.tableId,
    path: `/online/${kind === "PUBLIC" ? "public" : "private"}/table/${snapshot.tableId}`,
    variantLabel: snapshot.table.variantLabel,
    waiting: snapshot.table.status === "WAITING_FOR_PLAYERS",
    yours: mine ? match.northSouth : match.eastWest,
    theirs: mine ? match.eastWest : match.northSouth,
    target: match.target
  };
}
