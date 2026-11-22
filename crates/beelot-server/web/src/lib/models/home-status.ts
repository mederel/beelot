// What home shows about a match in progress (US-122, US-145): the resume records on this device, and the cards built from
// the tables' snapshots. No DOM, no translation.
import type { Snapshot } from "$lib/api/types";
import { KEYS, readJson, writeJson, type Store } from "$lib/storage";

export const RESUME_KEY = KEYS.resume;
export const ONLINE_RESUME_KEY = KEYS.resumeOnline;
const ONLINE_RESUME_MAX = 3;

export interface ResumeRecord {
  tableId: string;
  playerToken: string;
}

const isResume = (record: any): record is ResumeRecord => Boolean(record) && typeof record.tableId === "string" && typeof record.playerToken === "string";

export function readResume(storage: Store): ResumeRecord | null {
  return readJson(storage, RESUME_KEY, null, isResume);
}

export function rememberResume(storage: Store, tableId: string, playerToken: string | null | undefined): void {
  if (!tableId || !playerToken) return;
  writeJson(storage, RESUME_KEY, { tableId, playerToken });
}

export function forgetResume(storage: Store): void {
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
  if (snapshot?.table?.kind !== "LOCAL" || snapshot.table.passAndPlay) return null;
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

export function readOnlineResumes(storage: Store): ResumeRecord[] {
  const list = readJson(storage, ONLINE_RESUME_KEY, [], Array.isArray);
  return list.filter(isResume).slice(0, ONLINE_RESUME_MAX);
}

function writeOnlineResumes(storage: Store, list: ResumeRecord[]): void {
  if (list.length) writeJson(storage, ONLINE_RESUME_KEY, list);
  else forgetKey(storage, ONLINE_RESUME_KEY);
}

function forgetKey(storage: Store, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* nothing to forget */
  }
}

// The table goes first; an older record of the same table is replaced; beyond three the oldest is dropped.
export function rememberOnlineResume(storage: Store, tableId: string, playerToken: string | null | undefined): void {
  if (!tableId || !playerToken) return;
  const others = readOnlineResumes(storage).filter((r) => r.tableId !== tableId);
  writeOnlineResumes(storage, [{ tableId, playerToken }, ...others].slice(0, ONLINE_RESUME_MAX));
}

export function forgetOnlineResume(storage: Store, tableId: string): void {
  writeOnlineResumes(
    storage,
    readOnlineResumes(storage).filter((r) => r.tableId !== tableId)
  );
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
