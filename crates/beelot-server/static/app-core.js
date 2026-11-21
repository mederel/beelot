// Routing, choices and the shared table-state helpers.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
import { announceEvents } from "./app-announce.js";
import { streamMessage } from "./table-events.js";
import { setupDialog, openSetupSheet, helpDialog, openHelpSheet, loadOpenTables } from "./app-auction.js";
import { closeMatchEnd, setBotExpression, resetBotComments, commentOnEvents, effectsLevel } from "./app-celebrations.js";
import { loadDailyCard, loadDailyBoard } from "./app-daily.js";
import { addFriendFromLink } from "./app-friends.js";
import { loadResumeCard, loadPolicyInfo, showTutorialStep, apiJson } from "./app-session.js";
import { loadTable, setSuitText, clearHandReasons } from "./app-solo-table.js";
import { navigate, closeTableMenu, soloScreens, resyncAfterReconnect, tableToaster, resetTableToasts, updateAuctionBid, loadAuction, loadOnlineTable, setLeaveState, setTableStatusText } from "./app-table-ui.js";
import { loadLeaderboard, loadStatistics } from "./app.js";
import { botCharacter } from "./bot-characters.js";
import { createBotExpressionState } from "./bot-expression-state.js";
import { botEvents, expressionsFor, isThinking } from "./bot-reactions.js";
import { readResume, readOnlineResumes } from "./home-status.js";
import { t, localized, suitName, playerName, formatNumber } from "./i18n.js";
import { showConnectionTrouble, showReconnectButton, showMissedLine } from "./offline.js";
import { paceDelay } from "./pace.js";
import { makeGapTracker } from "./reconnect.js";
import { routeFor, tabBarState } from "./router.js";
import { scoreBarModel, scoreBarAnnouncement, countValue, roundPointsText } from "./score-bar.js";
import { sheets } from "./sheet.js";

const privateSessionKey = "beelot.private-table-session";
// A human needs time to follow each decision: a beat of "thinking", then the call stays in the spotlight. The pauses
// are the base delays of pace.js, scaled by the pace chosen in Settings (US-147).
function paced(name) {
  return paceDelay(name, document.body.dataset.pace);
}
const trickRenderState = new WeakMap();
// Classic Belote deals 3 then 2 cards; Contrée deals 3-2-3 in one go.
const firstDealSteps = { CLASSIC: [3, 2], CONTREE: [3, 2, 3] };
const tutorialSteps = [
  { title: "Trump wins", prompt: "Hearts are trump. Which card is strongest?", cards: [{ rank: "A", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "HEARTS", symbol: "♥" }], correct: 1, feedback: "Correct. At trump, the jack is the strongest card." },
  { title: "Normal card strength", prompt: "Clubs are not trump. Which card wins this trick?", cards: [{ rank: "10", suit: "CLUBS", symbol: "♣" }, { rank: "A", suit: "CLUBS", symbol: "♣" }], correct: 1, feedback: "Correct. Outside trump, ace is stronger than 10." },
  { title: "Follow suit", prompt: "Hearts were led. Which card must you play if these are your choices?", cards: [{ rank: "7", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "SPADES", symbol: "♠" }], correct: 0, feedback: "Correct. You must follow the lead suit when you can." },
  { title: "Take the trick", prompt: "Spades are trump and clubs were led. Which card takes this trick?", cards: [{ rank: "A", suit: "CLUBS", symbol: "♣" }, { rank: "7", suit: "SPADES", symbol: "♠" }], correct: 1, feedback: "Correct. A trump card beats cards in the lead suit." }
];
let tutorialStep = 0;
let lastDealKey = "";
let pendingSecondDeal = null;
let pendingTrickCollection = "";
const botExpressionState = createBotExpressionState({
  isBot: (name) => botCharacter(name) !== null,
  // These are called later, once every script has loaded: functions of the later scripts are not yet known here.
  setExpression: (...args) => setBotExpression(...args),
  botEvents,
  expressionsFor,
  isThinking,
  onEvents: (...args) => commentOnEvents(...args)
});

// A device that still holds the flag of the old table views (removed by US-160) drops it. The address is never read for a
// choice of table: the page is the one table.
try {
  window.localStorage.removeItem("beelot.legacy-table");
} catch (_) { /* blocked storage holds nothing to drop */ }

function viewForPath(path) {
  return routeFor(path).view;
}

// Whether the address is an online table (US-121).
function onlineTable() {
  return viewForPath(window.location.pathname) === "table" && routeFor(window.location.pathname).phase === "online";
}

// Whether the address is the table (cards or lobby) of this id, and whether it is the auction route.
function tableShown(id) {
  const route = routeFor(window.location.pathname);
  return route.view === "table" && route.phase !== "auction" && route.params.id === id;
}

function auctionShown(id) {
  const route = routeFor(window.location.pathname);
  return route.view === "table" && route.phase === "auction" && route.params.id === id;
}

// Where leaving the table leads to: the lobby of its kind online, the setup of a game otherwise.
function tableExitPath() {
  return onlineTable() ? tableHomePath() : "/play/bot";
}

// Whether the address is the auction of the card table (the sheet over it).
function onAuctionTable() {
  return viewForPath(window.location.pathname) === "table" && routeFor(window.location.pathname).phase === "auction";
}

// The id in the address of a game, an auction or an online table.
function currentRouteId() {
  return routeFor(window.location.pathname).params.id ?? "";
}

// Choices (bid amounts, suits, variants…) are groups of radio inputs styled as buttons, addressed by name.
function choiceInputs(name) {
  return [...document.querySelectorAll(`input[name="${name}"]`)];
}

function choiceValue(name) {
  return choiceInputs(name).find((input) => input.checked)?.value;
}

function setChoice(name, value) {
  const input = choiceInputs(name).find((item) => item.value === String(value));
  if (input) input.checked = true;
}

// Public (matchmaking) tables share the online table; this is the page to return to from one.
function tableHomePath() {
  return window.location.pathname.startsWith("/online/public") ? "/online/public" : "/online/private";
}

// The online table this browser tab plays at: its id and player token.
function getPrivateSession() {
  const stored = window.sessionStorage.getItem(privateSessionKey);
  return stored ? JSON.parse(stored) : null;
}

// One table API for solo, pass-and-play and online tables. Each table answers a snapshot: {version, moves, tableId, kind,
// you, table, bidding?, board?, match?, reactions}, whose parts keep the shapes the renderers below were written for
// (examples in crates/beelot-server/tests/contract/*.json). The player token of each table the tab has created or
// joined is kept for the tab only.
const tableTokensKey = "beelot.table-tokens";

function tableTokens() {
  try {
    return JSON.parse(window.sessionStorage.getItem(tableTokensKey) ?? "{}");
  } catch (_) {
    return {};
  }
}

function tableSession(tableId) {
  // A solo match on this device can be resumed in a new tab or after a restart (US-122).
  const resume = readResume(window.localStorage);
  // So can an online match at which the device holds a seat (US-145).
  const playerToken = tableTokens()[tableId] ?? (resume?.tableId === tableId ? resume.playerToken : null)
    ?? readOnlineResumes(window.localStorage).find((record) => record.tableId === tableId)?.playerToken ?? null;
  return playerToken ? { tableId, playerToken } : null;
}

function saveTableSession({ tableId, playerToken }) {
  const tokens = tableTokens();
  tokens[tableId] = playerToken;
  window.sessionStorage.setItem(tableTokensKey, JSON.stringify(tokens));
}

function forgetTableSession(tableId) {
  const tokens = tableTokens();
  delete tokens[tableId];
  window.sessionStorage.setItem(tableTokensKey, JSON.stringify(tokens));
}

// The newest snapshot of each table, from the API's answers and the table's event stream.
const latestSnapshots = new Map();

function rememberSnapshot(snapshot) {
  const known = latestSnapshots.get(snapshot.tableId);
  if (!known || known.version <= snapshot.version) latestSnapshots.set(snapshot.tableId, snapshot);
  return snapshot;
}

function jsonRequest(method, value, tableId) {
  const session = tableId ? tableSession(tableId) : null;
  return {
    method,
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session ? { Authorization: `Bearer ${session.playerToken}` } : {})
    },
    body: value === undefined ? undefined : JSON.stringify(value)
  };
}

const api = {
  async createTable(body) {
    const access = await apiJson("/api/tables", jsonRequest("POST", body));
    saveTableSession(access);
    return access;
  },
  async join(code, playerName) {
    const access = await apiJson("/api/tables/join", jsonRequest("POST", { code, playerName }));
    saveTableSession(access);
    return access;
  },
  async watch(code) {
    const access = await apiJson("/api/tables/watch", jsonRequest("POST", { code }));
    saveTableSession(access);
    return access;
  },
  async quickMatch(variant, playerName) {
    const access = await apiJson("/api/matchmaking/quick-match", jsonRequest("POST", { variant, playerName }));
    saveTableSession(access);
    return access;
  },
  async startDaily() {
    const access = await apiJson("/api/daily", jsonRequest("POST", undefined));
    saveTableSession(access);
    return access;
  },
  async table(tableId) {
    return rememberSnapshot(await apiJson(`/api/tables/${tableId}`, jsonRequest("GET", undefined, tableId)));
  },
  async hint(tableId) {
    return apiJson(`/api/tables/${tableId}/hint`, jsonRequest("GET", undefined, tableId));
  },
  async explanations(tableId) {
    return apiJson(`/api/tables/${tableId}/explanations`, jsonRequest("GET", undefined, tableId));
  },
  async analysis(tableId) {
    return apiJson(`/api/tables/${tableId}/analysis`, jsonRequest("GET", undefined, tableId));
  },
  async act(tableId, action) {
    const known = latestSnapshots.get(tableId)?.version ?? -1;
    try {
      return rememberSnapshot(await apiJson(`/api/tables/${tableId}/actions`, jsonRequest("POST", action, tableId)));
    } catch (error) {
      if (!error.network) throw error;
      // No answer: the move may still have arrived. A newer table than the one known means it did (US-141).
      const fresh = await api.table(tableId).catch(() => null);
      if (fresh && fresh.version > known) return fresh;
      throw error;
    }
  }
};

// The newest snapshot known, or a fresh one.
async function currentSnapshot(tableId) {
  return latestSnapshots.get(tableId) ?? api.table(tableId);
}

// Hints (US-065): at local tables, the card or bid the Challenging bot would choose for the player in turn, and why.
// A hint is highlighted until the next render, which clears it.
const hintReasons = {
  LEAD_TRUMPS: "Lead trumps",
  CASH_MASTER: "Cash a master card",
  LEAD_LOW: "Lead a low card",
  GIVE_POINTS: "Give points to your partner",
  KEEP_PARTNERS_TRICK: "Keep your partner's trick",
  WIN_CHEAPLY: "Win the trick cheaply",
  THROW_CHEAPEST: "Throw your cheapest card",
  BEST_FOR_ROUND: "The best card for the rest of the round",
  SUPPORT_PARTNER: "Support your partner's bid",
  BID_HAND_VALUE: "Bid what your hand is worth",
  COINCHE: "Coinche: you expect to defeat them",
  PASS_WEAK: "Pass: your hand is too weak"
};

function clearHint() {
  document.querySelectorAll(".hint-card, .hint-bid").forEach((item) => item.classList.remove("hint-card", "hint-bid"));
  document.querySelectorAll(".hint-reason").forEach((line) => {
    line.hidden = true;
    line.textContent = "";
  });
  if (tableToaster.current()?.kind === "hint") tableToaster.clear();
}

// Shows or hides a Hint button for the table's next render, which also clears the previous hint.
function offerHint(buttonSelector, gameId, offered) {
  clearHint();
  const button = document.querySelector(buttonSelector);
  button.hidden = !offered;
  button.disabled = false;
  button.onclick = () => askForHint(gameId, button);
}

function highlightHintBid(action) {
  const ids = { pass: "#auction-pass", coinche: "#auction-coinche", contract: "#auction-bid", accept: "#auction-take", trumps: "#auction-trumps", value: "auction-value", suit: "auction-suit" };
  const bidButton = { pass: ids.pass, coinche: ids.coinche, contract: ids.contract }[action.type];
  let target = bidButton && document.querySelector(bidButton);
  if (action.type === "trump") {
    // In the first round the only trump to take is the upturned suit.
    const accept = document.querySelector(ids.accept);
    target = accept.hidden ? document.querySelector(`${ids.trumps} button[data-suit="${action.suit}"]`) : accept;
  } else if (action.type === "contract") {
    setChoice(ids.value, action.value);
    setChoice(ids.suit, action.suit);
    updateAuctionBid();
  }
  target?.classList.add("hint-bid");
}

async function askForHint(gameId, button) {
  button.disabled = true;
  try {
    const hint = await api.hint(gameId);
    clearHint();
    const bidding = hint.type === "bid";
    if (bidding) {
      highlightHintBid(hint.action);
    } else {
      document.querySelector(`${soloScreens.table.hand} [data-card="${hint.card.rank}-${hint.card.suit}"]`)?.classList.add("hint-card");
    }
    const reason = hint.reason === "TAKE"
      ? t("Take: strong hand in {0}", suitName(hint.action.suit, false))
      : t(hintReasons[hint.reason]);
    if (!bidding) {
      tableToaster.push(reason, "hint");
    } else {
      const line = document.querySelector("#auction-hint-reason");
      setSuitText(line, reason);
      line.hidden = false;
    }
  } catch (_) {
    // A failed request shows nothing new.
  } finally {
    button.disabled = false;
  }
}

// A local table as the solo screens show it.
function localGame(snapshot) {
  const table = snapshot.table;
  return {
    id: snapshot.tableId,
    difficulty: table.difficulty,
    difficultyLabel: table.difficultyLabel,
    variant: table.variant,
    variantLabel: table.variantLabel,
    seats: table.seats.map((seat) => ({ name: seat.name, type: seat.type })),
    passAndPlay: table.passAndPlay,
    announcements: table.announcements,
    allTrumps: table.allTrumps
  };
}

// The online table's event stream: a snapshot for each change, and the seat's presence while it is open. When the
// stream drops and the browser has not reopened it within 10 s, it is opened again after 1, 2, 4… up to 30 s.
let tableStream = null;
// The gaps of the stream (US-142, US-163): the note after three seconds, the "Reconnect now" button after ten, and when the
// stream is open again the line that counts the moves missed. The rules and the timers are in reconnect.js.
const streamGap = makeGapTracker({
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (id) => window.clearTimeout(id),
  movesOf: () => (tableStream ? latestSnapshots.get(tableStream.tableId)?.moves : undefined),
  // offline.js loads after this file, so its functions are looked up when they are called.
  view: {
    note: (on) => showConnectionTrouble(on),
    button: (visible, disabled) => showReconnectButton(visible, disabled),
    line: (line) => showMissedLine(line)
  }
});

function closeTableStream({ keepNote = false } = {}) {
  if (!tableStream) return;
  window.clearTimeout(tableStream.timer);
  tableStream.source?.close();
  tableStream = null;
  if (!keepNote) streamGap.cleared();
}

function openTableStream(tableId, retry = 1000, previousId = null) {
  if (tableStream?.tableId === tableId) return;
  closeTableStream();
  const session = tableSession(tableId);
  if (!session) return;
  const stream = { tableId, source: null, retry, timer: null, refused: false, lastEventId: previousId };
  tableStream = stream;
  const reopen = () => {
    if (tableStream !== stream || stream.refused) return;
    closeTableStream({ keepNote: true });
    openTableStream(tableId, Math.min(stream.retry * 2, 30000), stream.lastEventId);
  };
  // EventSource cannot send a header, and a URL reaches proxy logs: the URL carries a single-use ticket, never the
  // player token. A ticket is used up by one connection, so every reconnection asks for a new one.
  apiJson(`/api/tables/${tableId}/stream-ticket`, jsonRequest("POST", undefined, tableId)).then(
    ({ ticket }) => {
      if (tableStream !== stream) return;
      attachTableStream(stream, new EventSource(`/api/tables/${tableId}/events?ticket=${encodeURIComponent(ticket)}&events=1${stream.lastEventId ? `&lastEventId=${stream.lastEventId}` : ""}`), reopen);
    },
    () => {
      if (tableStream !== stream) return;
      streamGap.failed();
      stream.timer = window.setTimeout(reopen, stream.retry);
    }
  );
}

function attachTableStream(stream, source, reopen) {
  const { tableId } = stream;
  stream.source = source;
  source.addEventListener("open", () => {
    window.clearTimeout(stream.timer);
    stream.retry = 1000;
    // Back after a drop: what happened meanwhile is read again at once, and the moves missed are counted from that read.
    const ticket = streamGap.opened();
    if (ticket) resyncAfterReconnect().then(() => streamGap.announce(ticket, latestSnapshots.get(tableId)?.moves));
  });
  // A snapshot starts the stream or replaces what the client knows; an event is one thing that happened, and the last one
  // of a batch carries the table. The number of the last one is asked again from after a drop.
  const received = (event) => {
    const message = streamMessage(event.type, event.data, event.lastEventId);
    if (message.id) stream.lastEventId = message.id;
    announceEvents(message.spoken);
    if (!message.state) return;
    rememberSnapshot(message.state);
    if (onlineTable() && currentRouteId() === tableId) {
      loadOnlineTable(tableId);
    }
  };
  source.addEventListener("snapshot", received);
  source.addEventListener("event", received);
  source.addEventListener("error", (event) => {
    if (event.data) {
      // The server refused the stream: a bot keeps the seat.
      stream.refused = true;
      source.close();
      streamGap.cleared();
      setSuitText(document.querySelector("#lobby-message"), localized(JSON.parse(event.data), JSON.parse(event.data).message));
      return;
    }
    streamGap.failed();
    window.clearTimeout(stream.timer);
    stream.timer = window.setTimeout(() => {
      if (source.readyState !== EventSource.OPEN) reopen();
    }, source.readyState === EventSource.CLOSED ? stream.retry : 10000);
  });
}

// The "Reconnect now" button: the stream is opened again at once, with the first pause, and the table is read fresh.
function reconnectNow() {
  const stream = tableStream;
  if (!stream) return;
  const id = stream.tableId;
  streamGap.reconnectRequested();
  closeTableStream({ keepNote: true });
  openTableStream(id);
  resyncAfterReconnect();
}

// The score bar above the table: each team's match score and round points, the target, and the viewer's team.
// The live region speaks only when its sentence changes, so tricks, repeated renders and the move from bidding to
// the card table stay silent; the sentence is forgotten only when the player leaves the game (see renderView).
const scoreBarViews = ["table"];
let scoreBarSentence = "";
let scoreBarGame = "";
// The numbers and progress each team's chip shows now, `{ match, round, progress }`, forgotten with the game key
// so the first show of a game writes its score at once (US-091).
let shownScores = [{}, {}];
// One running count per number, keyed "team-kind": `{ frame, to, element }`.
const scoreCounts = new Map();

function cancelScoreCount(key) {
  const count = scoreCounts.get(key);
  if (!count) return;
  cancelAnimationFrame(count.frame);
  count.element.removeAttribute("aria-hidden");
  scoreCounts.delete(key);
}

function cancelScoreCounts() {
  [...scoreCounts.keys()].forEach(cancelScoreCount);
}

// Writes one number of the bar. A rise counts up from the value shown, over `duration`, at the Full effects level;
// a first value, a drop or another level writes it at once. The number is hidden from assistive technology while it
// counts, so only the live region speaks the score.
function showScoreNumber(team, kind, element, value, duration, text = formatNumber) {
  const key = `${team}-${kind}`;
  if (scoreCounts.get(key)?.to === value) return;
  cancelScoreCount(key);
  const write = (shown) => {
    shownScores[team][kind] = shown;
    element.textContent = shown == null ? "" : text(shown);
  };
  const from = shownScores[team][kind];
  if (value == null || from == null || !(value > from) || effectsLevel() !== "full") {
    write(value);
    return;
  }
  element.setAttribute("aria-hidden", "true");
  const start = performance.now();
  const step = (now) => {
    const progress = (now - start) / duration;
    write(countValue(from, value, progress));
    if (progress >= 1) cancelScoreCount(key);
    else scoreCounts.get(key).frame = requestAnimationFrame(step);
  };
  scoreCounts.set(key, { frame: requestAnimationFrame(step), to: value, element });
}

// Sets the chip's progress bar; a first value or a drop jumps there without its transition.
function showScoreProgress(team, chip, progress) {
  const shown = shownScores[team].progress;
  shownScores[team].progress = progress;
  const snap = shown == null || progress < shown;
  chip.classList.toggle("progress-snap", snap);
  chip.style.setProperty("--progress", progress);
  if (snap) {
    void chip.offsetWidth;
    chip.classList.remove("progress-snap");
  }
}

function showScoreBar(match, board, myTeam) {
  const model = scoreBarModel({ match, board, myTeam });
  if (!model) {
    hideScoreBar();
    return;
  }
  const bar = document.querySelector("#score-bar");
  model.teams.forEach((team, index) => {
    const chip = bar.querySelector(`[data-team="${index}"]`);
    chip.querySelector(".team-name").textContent = t(team.name);
    showScoreNumber(index, "match", chip.querySelector(".match-points"), team.matchScore, 700);
    const round = chip.querySelector(".round-points");
    showScoreNumber(index, "round", round, team.roundPoints, 300, (shown) => roundPointsText(shown, t("round"), formatNumber));
    showScoreProgress(index, chip, team.progress);
    chip.querySelector(".you-mark").hidden = !team.mine;
    chip.classList.toggle("mine", team.mine);
  });
  bar.querySelector(".score-target").textContent = t("to {0}", formatNumber(model.target));
  bar.hidden = false;
  const sentence = scoreBarAnnouncement(model, t, formatNumber);
  if (sentence !== scoreBarSentence) {
    scoreBarSentence = sentence;
    document.querySelector("#score-bar-live").textContent = sentence;
  }
}

function hideScoreBar() {
  cancelScoreCounts();
  document.querySelector("#score-bar").hidden = true;
}

// The view on screen after the last render, to tell a move from the home screen from a first load.
let shownView = null;

function renderView() {
  hideScoreBar();
  setLeaveState({ kind: null, matchComplete: false });
  const activeView = viewForPath(window.location.pathname);
  // Bidding and play share one header (US-106): its status line keeps its text across the switch and is cleared elsewhere.
  const tableView = activeView === "table";
  document.querySelector("#table-bar").hidden = !tableView;
  closeTableMenu(false);
  if (!tableView) {
    setTableStatusText(null);
    document.querySelector("#table-status").textContent = "";
  }
  const game = scoreBarViews.includes(activeView) ? currentRouteId() : "";
  if (game !== scoreBarGame) {
    scoreBarGame = game;
    closeMatchEnd();
    scoreBarSentence = "";
    cancelScoreCounts();
    shownScores = [{}, {}];
    document.querySelector("#score-bar-live").textContent = "";
    botExpressionState.reset(game);
    resetBotComments();
    clearHandReasons();
    resetTableToasts();
  }
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
    view.classList.remove("view-arrive");
  });
  // The music plays at a table only (US-164).
  if (typeof syncMusic === "function") syncMusic();
  // A view entered from the home screen arrives; a reload or a deep link has no previous view and does not.
  if (shownView === "home" && activeView !== "home") {
    document.querySelector(`[data-view="${activeView}"]`)?.classList.add("view-arrive");
  }
  shownView = activeView;
  // The tab bar (US-117): hidden during a match, otherwise it marks the tab of the page you are on.
  const bar = tabBarState(routeFor(window.location.pathname).tab);
  document.querySelector("#tab-bar").hidden = bar.hidden;
  document.querySelectorAll("#tab-bar .tab").forEach((link) => {
    if (link.dataset.tab === bar.current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = activeView === "home"
    ? t("Beelot — Play Belote")
    : `${document.querySelector(`[data-view="${activeView}"] :is(h1, h2)`).textContent} — Beelot`;

  // The route's sheet (US-118) opens over its page; a route without one ends a setup sheet left open by the back button.
  const route = routeFor(window.location.pathname);
  if (route.sheet === "setup") openSetupSheet(route.params.mode);
  else if (route.sheet === "help") {
    openHelpSheet({ routed: false, onClose: (reason) => { if (reason === "closed") navigate("/", { replace: true }); } });
  } else if (sheets.isOpen(setupDialog) || sheets.isOpen(helpDialog)) sheets.closeAll();

  if (!onlineTable()) closeTableStream();
  document.querySelector(".table-menu-leave").setAttribute("href", tableExitPath());
  if (activeView === "table") {
    if (onlineTable()) loadOnlineTable(currentRouteId());
    else (onAuctionTable() ? loadAuction : loadTable)(currentRouteId());
  }
  if (activeView === "home") loadResumeCard();
  if (activeView === "home") loadDailyCard();
  if (activeView === "private") loadOpenTables();
  if (activeView === "private" && window.location.pathname.startsWith("/friends/add/")) addFriendFromLink(currentRouteId());
  if (activeView === "tutorial") showTutorialStep();
  if (activeView === "stats") loadStatistics();
  if (activeView === "leaderboard") loadLeaderboard();
  if (activeView === "leaderboard") loadDailyBoard();
  if (activeView === "privacy") loadPolicyInfo();
}

function setLastDealKey(value) {
  lastDealKey = value;
}

function setPendingSecondDeal(value) {
  pendingSecondDeal = value;
}

function setPendingTrickCollection(value) {
  pendingTrickCollection = value;
}

function setTutorialStep(value) {
  tutorialStep = value;
}

export { privateSessionKey, paced, firstDealSteps, viewForPath, onlineTable, currentRouteId, choiceInputs, choiceValue, setChoice, getPrivateSession, tableTokens, forgetTableSession, api, clearHint, renderView, botExpressionState, scoreBarGame, setLastDealKey, jsonRequest, tutorialSteps, tutorialStep, tableSession, streamGap, trickRenderState, pendingSecondDeal, pendingTrickCollection, tableShown, tableExitPath, offerHint, localGame, closeTableStream, showScoreBar, setPendingSecondDeal, setPendingTrickCollection, setTutorialStep, lastDealKey, auctionShown, tableHomePath, currentSnapshot, openTableStream, hideScoreBar, reconnectNow, hintReasons };
