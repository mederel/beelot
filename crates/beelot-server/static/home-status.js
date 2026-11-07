// What home shows about a match in progress (US-122): the resume record of a solo match on this device, and the card
// built from the table's snapshot. No DOM, no translation.
const RESUME_KEY = "beelot.resume";

function readResume(storage) {
  try {
    const record = JSON.parse(storage.getItem(RESUME_KEY));
    return record && typeof record.tableId === "string" && typeof record.playerToken === "string" ? record : null;
  } catch (_) {
    return null;
  }
}

function rememberResume(storage, tableId, playerToken) {
  if (!tableId || !playerToken) return;
  try {
    storage.setItem(RESUME_KEY, JSON.stringify({ tableId, playerToken }));
  } catch (_) { /* the match is not remembered */ }
}

function forgetResume(storage) {
  try {
    storage.removeItem(RESUME_KEY);
  } catch (_) { /* nothing to forget */ }
}

// The card of a solo match in progress, or null when there is nothing to resume.
function resumeCard(snapshot) {
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

if (typeof module !== "undefined") module.exports = { RESUME_KEY, readResume, rememberResume, forgetResume, resumeCard };
