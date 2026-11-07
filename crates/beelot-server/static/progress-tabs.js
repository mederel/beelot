// Progress and Crew (US-124): which statistics panel shows, and which online tables are still open. No DOM.
const STATS_PANELS = ["overall", "variant", "difficulty"];

function statsPanel(choice) {
  return STATS_PANELS.includes(choice) ? choice : "overall";
}

// The tables to list in Crew: waiting or running online tables, newest id order kept as given.
function openTables(snapshots) {
  return snapshots
    .filter((snapshot) => snapshot?.table && (snapshot.table.kind === "PRIVATE" || snapshot.table.kind === "PUBLIC"))
    .filter((snapshot) => ["WAITING_FOR_PLAYERS", "IN_PROGRESS"].includes(snapshot.table.status) && !snapshot.match?.complete)
    .map((snapshot) => ({
      id: snapshot.tableId,
      path: `/online/${snapshot.table.kind === "PUBLIC" ? "public" : "private"}/table/${snapshot.tableId}`,
      variantLabel: snapshot.table.variantLabel,
      waiting: snapshot.table.status === "WAITING_FOR_PLAYERS",
      seated: snapshot.table.seats.length
    }));
}

if (typeof module !== "undefined") module.exports = { STATS_PANELS, statsPanel, openTables };
