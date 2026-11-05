// Small goals and streaks (US-113). A ledger is `{ played, won, results, seen }`: `results` are the last games,
// newest first, as `{ won, at }`; `seen` the signatures of the games already counted, so a reload of a finished
// match does not count it twice. Guests keep their ledger in localStorage; a signed-in player's comes from
// their statistics. Goals are friendly: a loss is never reported as a failure.

const GOALS_KEY = "beelot.goals";
const GOALS_KEEP = 20;

function emptyLedger() {
  return { played: 0, won: 0, results: [], seen: [] };
}

function sameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// `{ played, won, streak, brokenStreak, today }`: the current win streak, the streak a last loss just ended
// (0 when the last game was won or no streak of 2 or more was behind the loss) and the games finished today.
function goalSummary({ played, won, results }, now = Date.now()) {
  const streak = results.findIndex((result) => !result.won);
  const winsFrom = (start) => {
    const next = results.findIndex((result, index) => index >= start && !result.won);
    return (next === -1 ? results.length : next) - start;
  };
  const current = streak === -1 ? results.length : streak;
  const ended = results.length > 0 && !results[0].won ? winsFrom(1) : 0;
  return {
    played,
    won,
    streak: current,
    brokenStreak: ended >= 2 ? ended : 0,
    today: results.filter((result) => sameDay(result.at, now)).length,
  };
}

// The goal to show, as `{ key, args }` (key is an English text of the translation table).
function goalMessage(summary) {
  if (summary.played === 0) return { key: "Your first game awaits", args: [] };
  if (summary.streak >= 2) return { key: "{0} wins in a row", args: [summary.streak] };
  if (summary.brokenStreak >= 2) return { key: "Great run of {0} wins! Ready for a new one?", args: [summary.brokenStreak] };
  if (summary.won === 0) return { key: "First win in sight", args: [] };
  if (summary.today >= 2) return { key: "{0} games today", args: [summary.today] };
  if (summary.streak === 1) return { key: "Win again for a streak", args: [] };
  return { key: "Win the next one to start a streak", args: [] };
}

// What a game that just finished celebrates, given the totals before it: "firstWin", "firstGame" or null.
function goalCelebration(before, won) {
  if (won && before.won === 0) return "firstWin";
  if (!won && before.played === 0) return "firstGame";
  return null;
}

// The ledger with the finished game added, unless `signature` was already counted.
function recordResult(ledger, signature, won, now = Date.now()) {
  if (ledger.seen.includes(signature)) return ledger;
  return {
    played: ledger.played + 1,
    won: ledger.won + (won ? 1 : 0),
    results: [{ won, at: now }, ...ledger.results].slice(0, GOALS_KEEP),
    seen: [...ledger.seen, signature].slice(-GOALS_KEEP),
  };
}

function loadLedger(storage) {
  try {
    const stored = JSON.parse(storage.getItem(GOALS_KEY));
    if (stored && Number.isFinite(stored.played) && Number.isFinite(stored.won) && Array.isArray(stored.results) && Array.isArray(stored.seen)) {
      return stored;
    }
  } catch (_) { /* missing, corrupt or blocked storage: start again */ }
  return emptyLedger();
}

function saveLedger(storage, ledger) {
  try {
    storage.setItem(GOALS_KEY, JSON.stringify(ledger));
  } catch (_) { /* storage unavailable: the goals last for this page only */ }
}

// A signed-in player's ledger from `/api/statistics` (recent matches come most recent first).
function ledgerFromStatistics(statistics) {
  return {
    played: statistics.overall.played,
    won: statistics.overall.won,
    results: statistics.recentMatches.map((match) => ({ won: match.won, at: Date.parse(match.endedAt) })),
    seen: [],
  };
}

if (typeof module !== "undefined") {
  module.exports = { goalSummary, goalMessage, goalCelebration, recordResult, loadLedger, saveLedger, ledgerFromStatistics, emptyLedger };
}
