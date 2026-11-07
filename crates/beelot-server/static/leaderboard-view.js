// The leaderboard page (US-069): how the player's own place is told. No DOM.

// The sentence about the viewer: null for a guest or a player with no rated match. `mine` and `minMatches` come from
// `/api/leaderboard`.
function mineNote(mine, minMatches) {
  if (!mine) return null;
  if (mine.hidden) return { text: "You are hidden from the leaderboard. You can change this in Settings.", values: [] };
  if (mine.rank == null) return { text: "Play {0} more rated matches to appear on the leaderboard.", values: [Math.max(0, minMatches - mine.matches)] };
  return { text: "Your rank: {0} ({1})", values: [mine.rank, mine.rating] };
}

// Whether the viewer's own row is already in the list, so that it can be marked there.
function isMineListed(rows, mine) {
  return Boolean(mine && mine.rank != null && rows.some((row) => row.rank === mine.rank && row.rating === mine.rating));
}

if (typeof module !== "undefined") module.exports = { mineNote, isMineListed };
