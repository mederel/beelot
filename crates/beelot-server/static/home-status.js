// What home shows about a match in progress (US-122): the resume record of a solo match on this device, and the card
// built from the table's snapshot. No DOM, no translation.
const RESUME_KEY = "beelot.resume";
// The online matches this device holds a seat at (US-145): newest first, at most three.
const ONLINE_RESUME_KEY = "beelot.resume-online";
const ONLINE_RESUME_MAX = 3;

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

function readOnlineResumes(storage) {
  try {
    const list = JSON.parse(storage.getItem(ONLINE_RESUME_KEY));
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && typeof r.tableId === "string" && typeof r.playerToken === "string")
      .slice(0, ONLINE_RESUME_MAX);
  } catch (_) {
    return [];
  }
}

function writeOnlineResumes(storage, list) {
  try {
    if (list.length) storage.setItem(ONLINE_RESUME_KEY, JSON.stringify(list));
    else storage.removeItem(ONLINE_RESUME_KEY);
  } catch (_) { /* the match is not remembered */ }
}

// The table goes first; an older record of the same table is replaced; beyond three the oldest is dropped.
function rememberOnlineResume(storage, tableId, playerToken) {
  if (!tableId || !playerToken) return;
  const others = readOnlineResumes(storage).filter((r) => r.tableId !== tableId);
  writeOnlineResumes(storage, [{ tableId, playerToken }, ...others].slice(0, ONLINE_RESUME_MAX));
}

function forgetOnlineResume(storage, tableId) {
  writeOnlineResumes(storage, readOnlineResumes(storage).filter((r) => r.tableId !== tableId));
}

// The card of an online match in which the viewer holds a seat, or null when there is nothing to resume: a spectator,
// a solo or pass-and-play table, or a match that is over.
function onlineResumeCard(snapshot) {
  const kind = snapshot?.table?.kind;
  if ((kind !== "PRIVATE" && kind !== "PUBLIC") || snapshot.you === null || snapshot.you === undefined) return null;
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

if (typeof module !== "undefined") module.exports = { RESUME_KEY, ONLINE_RESUME_KEY, readResume, rememberResume, forgetResume, resumeCard,
  readOnlineResumes, rememberOnlineResume, forgetOnlineResume, onlineResumeCard };
