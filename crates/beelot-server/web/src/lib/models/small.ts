// Small rules of several pages, with no DOM: leaving a table (US-110), the statistics panel and the open tables (US-124),
// the invitation code boxes (US-124), the display name (US-072), friends (US-070), the daily deal (US-150), the
// leaderboard (US-069), the rating (US-068) and the costly cards of a review (US-067, US-149).
import type { Snapshot } from "$lib/api/types";

export function leaveConfirmation({ kind, matchComplete }: { kind: "online" | "solo" | null; matchComplete: boolean }): { title: string; message: string } | null {
  if (!kind || matchComplete) return null;
  return {
    title: "Leave this table?",
    message: kind === "online" ? "If you stay away, a bot will take over your seat." : "The game will be abandoned."
  };
}

export const STATS_PANELS = ["overall", "variant", "difficulty"] as const;
export type StatsPanel = (typeof STATS_PANELS)[number];

export function statsPanel(choice: string | null | undefined): StatsPanel {
  return (STATS_PANELS as readonly string[]).includes(choice ?? "") ? (choice as StatsPanel) : "overall";
}

export interface OpenTable {
  id: string;
  path: string;
  variantLabel: string;
  waiting: boolean;
  seated: number;
}

// The tables to list in Crew: waiting or running online tables, in the order given.
export function openTables(snapshots: (Snapshot | null)[]): OpenTable[] {
  return snapshots
    .filter((snapshot): snapshot is Snapshot => Boolean(snapshot?.table) && (snapshot!.table.kind === "PRIVATE" || snapshot!.table.kind === "PUBLIC"))
    .filter((snapshot) => ["WAITING_FOR_PLAYERS", "IN_PROGRESS"].includes(snapshot.table.status) && !snapshot.match?.complete)
    .map((snapshot) => ({
      id: snapshot.tableId,
      path: `/online/${snapshot.table.kind === "PUBLIC" ? "public" : "private"}/table/${snapshot.tableId}`,
      variantLabel: snapshot.table.variantLabel,
      waiting: snapshot.table.status === "WAITING_FOR_PLAYERS",
      seated: snapshot.table.seats.length
    }));
}

export const CODE_LENGTH = 6;

export function normalizeCode(text: unknown): string {
  return String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

// The text of each box for a typed or pasted value, from the box at `start`.
export function spreadCode(current: string[], start: number, text: string): string[] {
  const boxes = Array.from({ length: CODE_LENGTH }, (_, index) => current[index] ?? "");
  const characters = normalizeCode(text).slice(0, CODE_LENGTH - start);
  characters.split("").forEach((character, offset) => {
    boxes[start + offset] = character;
  });
  return boxes;
}

// Which box takes the focus after typing into `index` (the one after a filled box, or the last box).
export function boxAfterInput(index: number, boxes: string[]): number {
  return boxes[index] !== "" ? Math.min(index + 1, CODE_LENGTH - 1) : index;
}

// Which box takes the focus after Backspace in an empty box (the one before).
export function boxAfterBackspace(index: number, boxes: string[]): number {
  return boxes[index] === "" ? Math.max(index - 1, 0) : index;
}

export const MAX_DISPLAY_NAME = 30;

// The name to send, or the message to show. Characters are counted as people see them, not as UTF-16 units.
export function checkDisplayName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name === "") return { ok: false, message: "Enter a player name." };
  if ([...name].length > MAX_DISPLAY_NAME) return { ok: false, message: "Player names are limited to 30 characters." };
  return { ok: true, name };
}

export interface Friend {
  id: string;
  name: string;
  online?: boolean;
}

export const friendLinkUrl = (origin: string, code: string) => `${origin}/friends/add/${code}`;

// The link to a private table (US-212): the server answers it with a preview, the Crew page with the code typed in.
export const inviteLinkUrl = (origin: string, code: string) => `${origin}/join/${code}`;

// Friends who are online first, each group in the order the server gave.
export function sortFriends<T extends { online?: boolean }>(friends: T[]): T[] {
  return [...friends.filter((friend) => friend.online), ...friends.filter((friend) => !friend.online)];
}

// The invitations the player has not been shown yet; `seen` holds the ids already shown.
export function newInvites<T extends { id: string }>(invites: T[], seen: Set<string>): T[] {
  return invites.filter((invite) => !seen.has(invite.id));
}

// What opening a friend link led to: the server's status for the person's name.
export function linkMessage(result: { status: string; name: string }): { text: string; values: string[] } {
  return result.status === "friends"
    ? { text: "You and {0} are friends now.", values: [result.name] }
    : { text: "Friend request sent to {0}. They need to accept it.", values: [result.name] };
}

export interface DailyInfo {
  day: string;
  variant: string;
  rows: { rank: number; name: string; score: number }[];
  mine: { score: number | null; rank?: number } | null;
}

// The home card: its detail line and whether it can start. A signed-in player who started the deal already cannot start it
// again; a guest always can.
export function dailyCard(info: DailyInfo): { variantKey: string; detail: string; values: number[]; canStart: boolean } {
  const variantKey = info.variant === "CONTREE" ? "Contrée" : info.variant === "BELA" ? "Bela" : "Classic Belote";
  if (info.mine?.score != null) return { variantKey, detail: "Your score: {0}", values: [info.mine.score], canStart: false };
  if (info.mine) return { variantKey, detail: "Started: finish it or wait for tomorrow's deal", values: [], canStart: false };
  return { variantKey, detail: "One deal a day, the same for everyone", values: [], canStart: true };
}

// The sentence about the viewer on the board: null for a guest or a player who has not finished the deal.
export function dailyMineNote(mine: DailyInfo["mine"]): { text: string; values: number[] } | null {
  if (!mine || mine.score == null) return null;
  return { text: "Your rank: {0} ({1})", values: [mine.rank ?? 0, mine.score] };
}

// The rows of the daily board's table.
export const dailyRows = (rows: DailyInfo["rows"]) => rows.map((row) => [row.rank, row.name, row.score]);

export interface BoardMine {
  hidden?: boolean;
  rank: number | null;
  rating: number;
  matches: number;
}

// The sentence about the viewer on the leaderboard: null for a guest or a player with no rated match.
export function mineNote(mine: BoardMine | null | undefined, minMatches: number): { text: string; values: number[] } | null {
  if (!mine) return null;
  if (mine.hidden) return { text: "You are hidden from the leaderboard. You can change this in Settings.", values: [] };
  if (mine.rank == null) return { text: "Play {0} more rated matches to appear on the leaderboard.", values: [Math.max(0, minMatches - mine.matches)] };
  return { text: "Your rank: {0} ({1})", values: [mine.rank, mine.rating] };
}

// Whether the viewer's own row is already in the list, so that it can be marked there.
export function isMineListed(rows: { rank: number; rating: number }[], mine: BoardMine | null | undefined): boolean {
  return Boolean(mine && mine.rank != null && rows.some((row) => row.rank === mine.rank && row.rating === mine.rating));
}

export const PROVISIONAL_DEVIATION = 110;

export interface RatingRow {
  variant: string;
  rating: number;
  deviation: number;
  matches: number;
  provisional: boolean;
  history: { rating: number }[];
}

export function ratingRows(ratings: any[] | null | undefined): RatingRow[] {
  return (ratings ?? []).map((entry) => ({
    variant: entry.variant,
    rating: entry.rating,
    deviation: entry.deviation,
    matches: entry.matches,
    provisional: entry.deviation > PROVISIONAL_DEVIATION,
    history: entry.history ?? []
  }));
}

// The points of a polyline drawing the history in a width x height box: oldest on the left, the highest rating at the top.
export function sparklinePoints(history: { rating: number }[], width: number, height: number): string {
  if (history.length === 0) return "";
  const values = history.map((point) => point.rating);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const margin = 3;
  return history
    .map((point, index) => {
      const x = history.length === 1 ? width / 2 : (index * width) / (history.length - 1);
      const y = history.length === 1 ? height / 2 : margin + (1 - (point.rating - low) / span) * (height - 2 * margin);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export interface Analysis {
  complete: boolean;
  costly: { trick: number; position: number; played: any; best: any; pointsLost: number }[];
}

// The costly cards of the trick shown at `step` (step n shows trick n; the deal, step 0, shows none).
export function costlyAtStep(analysis: Analysis | null | undefined, step: number) {
  if (!analysis || step < 1) return [];
  return analysis.costly.filter((entry) => entry.trick === step - 1);
}

// What the review says at the deal: that the cards are being analysed, how many cost points, or that none did.
export function costlySummary(analysis: Analysis | null | undefined): { text: string; values: number[] } | null {
  if (analysis === undefined) return { text: "Analysing your cards…", values: [] };
  if (analysis === null) return null;
  if (analysis.costly.length === 0) return { text: analysis.complete ? "No costly card: well played!" : "No costly card in the part analysed.", values: [] };
  return {
    text: analysis.complete ? "Costly cards: {0}. Step through the tricks to see them." : "Costly cards found: {0}. The analysis is partial. Step through the tricks to see them.",
    values: [analysis.costly.length]
  };
}

// Why the bots played the cards of the trick shown at `step` (US-149): the place in the trick mapped to the reason code; a
// code the client does not know is left out rather than guessed.
export function explanationsAtStep(explanations: any[] | null | undefined, step: number, knownReasons: Record<string, string>): Map<number, string> {
  const found = new Map<number, string>();
  if (!Array.isArray(explanations) || step < 1) return found;
  for (const entry of explanations) {
    if (entry.trick === step - 1 && Object.hasOwn(knownReasons, entry.reason)) found.set(entry.position, entry.reason);
  }
  return found;
}
export const joinedCode = (boxes: string[]) => boxes.join("");
