// The daily deal on the screen (US-150): what home says about it and how the day's board is told. No DOM.
// `info` is `/api/daily`: `{ day, variant, today, rows: [{ rank, name, score }], mine: { score, rank } | null }`.

// The home card: its detail line (an English key of the translations with its values) and whether it can start.
// A signed-in player who started the deal already cannot start it again; a guest always can.
function dailyCard(info) {
  const variantKey = info.variant === "CONTREE" ? "Contrée" : "Classic Belote";
  if (info.mine?.score != null) return { variantKey, detail: "Your score: {0}", values: [info.mine.score], canStart: false };
  if (info.mine) return { variantKey, detail: "Started: finish it or wait for tomorrow's deal", values: [], canStart: false };
  return { variantKey, detail: "One deal a day, the same for everyone", values: [], canStart: true };
}

// The sentence about the viewer on the board: null for a guest or a player who has not finished the deal.
function dailyMineNote(mine) {
  if (!mine || mine.score == null) return null;
  return { text: "Your rank: {0} ({1})", values: [mine.rank, mine.score] };
}

// The rows of the board's table.
function dailyRows(rows) {
  return rows.map((row) => [row.rank, row.name, row.score]);
}

if (typeof module !== "undefined") module.exports = { dailyCard, dailyMineNote, dailyRows };
