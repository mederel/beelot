// Small goals and streaks (US-113). A ledger is `{ played, won, results, seen }`: `results` are the last games, newest
// first; `seen` the signatures of the games already counted. Guests keep their ledger in localStorage; a signed-in
// player's comes from their statistics. A loss is never reported as a failure.
import { KEYS, readJson, writeJson, type Store } from "$lib/storage";

const GOALS_KEY = KEYS.goals;
const GOALS_KEEP = 20;

export interface Ledger {
  played: number;
  won: number;
  results: { won: boolean; at: number }[];
  seen: string[];
}

export function emptyLedger(): Ledger {
  return { played: 0, won: 0, results: [], seen: [] };
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export interface GoalSummary {
  played: number;
  won: number;
  streak: number;
  brokenStreak: number;
  today: number;
}

// The current win streak, the streak a last loss just ended (0 when none of 2 or more) and the games finished today.
export function goalSummary({ played, won, results }: Ledger, now = Date.now()): GoalSummary {
  const streak = results.findIndex((result) => !result.won);
  const winsFrom = (start: number) => {
    const next = results.findIndex((result, index) => index >= start && !result.won);
    return (next === -1 ? results.length : next) - start;
  };
  const current = streak === -1 ? results.length : streak;
  const ended = results.length > 0 && !results[0].won ? winsFrom(1) : 0;
  return { played, won, streak: current, brokenStreak: ended >= 2 ? ended : 0, today: results.filter((result) => sameDay(result.at, now)).length };
}

// The goal to show, as `{ key, args }` (key is an English text of the translations).
export function goalMessage(summary: GoalSummary): { key: string; args: number[] } {
  if (summary.played === 0) return { key: "Your first game awaits", args: [] };
  if (summary.streak >= 2) return { key: "{0} wins in a row", args: [summary.streak] };
  if (summary.brokenStreak >= 2) return { key: "Great run of {0} wins! Ready for a new one?", args: [summary.brokenStreak] };
  if (summary.won === 0) return { key: "First win in sight", args: [] };
  if (summary.today >= 2) return { key: "{0} games today", args: [summary.today] };
  if (summary.streak === 1) return { key: "Win again for a streak", args: [] };
  return { key: "Win the next one to start a streak", args: [] };
}

// What a game that just finished celebrates, given the totals before it.
export function goalCelebration(before: Pick<Ledger, "won" | "played">, won: boolean): "firstWin" | "firstGame" | null {
  if (won && before.won === 0) return "firstWin";
  if (!won && before.played === 0) return "firstGame";
  return null;
}

// The ledger with the finished game added, unless `signature` was already counted.
export function recordResult(ledger: Ledger, signature: string, won: boolean, now = Date.now()): Ledger {
  if (ledger.seen.includes(signature)) return ledger;
  return {
    played: ledger.played + 1,
    won: ledger.won + (won ? 1 : 0),
    results: [{ won, at: now }, ...ledger.results].slice(0, GOALS_KEEP),
    seen: [...ledger.seen, signature].slice(-GOALS_KEEP)
  };
}

const isLedger = (stored: any): stored is Ledger =>
  Boolean(stored) && Number.isFinite(stored.played) && Number.isFinite(stored.won) && Array.isArray(stored.results) && Array.isArray(stored.seen);

// A missing, corrupt or blocked storage starts the goals again.
export function loadLedger(storage: Store): Ledger {
  return readJson(storage, GOALS_KEY, emptyLedger(), isLedger);
}

// A storage that is unavailable keeps the goals for this page only.
export function saveLedger(storage: Store, ledger: Ledger): void {
  writeJson(storage, GOALS_KEY, ledger);
}

// A signed-in player's ledger from `/api/statistics` (recent matches come most recent first).
export function ledgerFromStatistics(statistics: any): Ledger {
  return {
    played: statistics.overall.played,
    won: statistics.overall.won,
    results: statistics.recentMatches.map((match: any) => ({ won: match.won, at: Date.parse(match.endedAt) })),
    seen: []
  };
}
