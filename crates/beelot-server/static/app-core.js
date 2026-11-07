// Routing, the legacy-table flag, choices and the shared table-state helpers.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
const privateSessionKey = "beelot.private-table-session";
// A human needs time to follow each decision: a beat of "thinking", then the call stays in the spotlight.
const biddingThinkDelay = 900;
const biddingRevealDelay = 1900;
const ownCallDelay = 1000;
const trickRevealDelay = 650;
// A completed trick stays on the table for a moment once its last card has landed, then slides to the winner.
const trickHoldDelay = 1800;
const trickCollectMs = 520;
const trickRenderState = new WeakMap();
const dealFlightMs = 340;
const dealGapMs = 140;
// Classic Belote deals 3 then 2 cards; Contrée deals 3-2-3 in one go.
const firstDealSteps = { CLASSIC: [3, 2], CONTREE: [3, 2, 3] };
const tutorialSteps = [
  { title: "Trump wins", prompt: "Hearts are trump. Which card is strongest?", cards: [{ rank: "A", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "HEARTS", symbol: "♥" }], correct: 1, feedback: "Correct. At trump, the jack is the strongest card." },
  { title: "Normal card strength", prompt: "Clubs are not trump. Which card wins this trick?", cards: [{ rank: "10", suit: "CLUBS", symbol: "♣" }, { rank: "A", suit: "CLUBS", symbol: "♣" }], correct: 1, feedback: "Correct. Outside trump, ace is stronger than 10." },
  { title: "Follow suit", prompt: "Hearts were led. Which card must you play if these are your choices?", cards: [{ rank: "7", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "SPADES", symbol: "♠" }], correct: 0, feedback: "Correct. You must follow the lead suit when you can." },
  { title: "Take the trick", prompt: "Spades are trump and clubs were led. Which card takes this trick?", cards: [{ rank: "A", suit: "CLUBS", symbol: "♣" }, { rank: "7", suit: "SPADES", symbol: "♠" }], correct: 1, feedback: "Correct. A trump card beats cards in the lead suit." }
];
let tutorialStep = 0;
let privateTableSnapshot = null;
let privateTableRequestId = 0;
let lastRenderedPrivateTableJson = "";
let lastRenderedPrivateBoardJson = "";
let lastRenderedPrivateBiddingJson = "";
let privateAllTrumps = true;
// The private auction on screen: its id and how many of its calls have been revealed. Null until the player has
// watched the table, so a page opened mid-auction shows the calls as they stand instead of replaying them.
let privateAuctionShown = null;
let privateAuctionRevealing = false;
let privateGameStage = "";
// The player's own call is shown when they make it, so it is not revealed again when the auction catches up.
let privateOwnCallShown = false;
let stopPrivateThinking = () => {};
let lastDealKey = "";
let pendingSecondDeal = null;
let pendingTrickCollection = "";
let pendingPrivateTrickRefresh = "";
const botExpressionState = createBotExpressionState({
  isBot: (name) => botCharacter(name) !== null,
  // These are called later, once every script has loaded: functions of the later scripts are not yet known here.
  setExpression: (...args) => setBotExpression(...args),
  botEvents,
  expressionsFor,
  isThinking,
  onEvents: (...args) => commentOnEvents(...args)
});

// The old solo table stays behind a flag while the new one is checked (US-119): `?table=legacy` turns it on and
// `?table=new` off, the choice is remembered on the device. Blocked storage means the new table.
function legacyTable() {
  try {
    return window.localStorage.getItem("beelot.legacy-table") === "true";
  } catch (_) {
    return false;
  }
}

function applyTableFlag() {
  const url = new URL(window.location.href);
  const choice = url.searchParams.get("table");
  if (choice !== "legacy" && choice !== "new") return;
  try {
    if (choice === "legacy") window.localStorage.setItem("beelot.legacy-table", "true");
    else window.localStorage.removeItem("beelot.legacy-table");
  } catch (_) { /* the flag is not remembered */ }
  url.searchParams.delete("table");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}
applyTableFlag();

function viewForPath(path) {
  const { view, phase } = routeFor(path);
  if (view === "table" && legacyTable()) {
    if (phase === "online") return "private-table";
    return phase === "auction" ? "bidding" : "bot-game";
  }
  return view;
}

// Whether the address is an online table drawn on the new table (US-121), not the old private table view.
function onlineTable() {
  return viewForPath(window.location.pathname) === "table" && routeFor(window.location.pathname).phase === "online";
}

// Whether the address is the table (cards or lobby) of this id, and whether it is the auction route of the old flow.
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

// Whether the address is the auction of the card table (the sheet over it), not the old bidding view.
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

// Keeps a legal option selected after some options were disabled.
function ensureEnabledChoice(name) {
  const inputs = choiceInputs(name);
  if (inputs.some((input) => input.checked && !input.disabled)) return;
  const fallback = inputs.find((input) => !input.disabled);
  if (fallback) fallback.checked = true;
}

// The all-trumps and no-trumps contracts (US-063) are offered only where the table plays them.
function offerAllTrumpChoices(name, offered) {
  choiceInputs(name).forEach((input) => {
    if (input.value === "ALL_TRUMPS" || input.value === "NO_TRUMPS") {
      input.closest("label").hidden = !offered;
      input.disabled = !offered;
    }
  });
  ensureEnabledChoice(name);
}

// Amounts at or below the standing contract are illegal; preselect the lowest legal one.
function updateAmountChoices(name, highestBid) {
  const inputs = choiceInputs(name);
  inputs.forEach((input) => { input.disabled = Number(input.value) <= highestBid; });
  (inputs.find((input) => !input.disabled) ?? inputs.at(-1)).checked = true;
}

function privateTableId() {
  return currentRouteId();
}

// Public (matchmaking) tables share the private table view; this is the page to return to from one.
function tableHomePath() {
  return window.location.pathname.startsWith("/online/public") ? "/online/public" : "/online/private";
}

// The online table this browser tab plays at: its id and player token.
function getPrivateSession() {
  const stored = window.sessionStorage.getItem(privateSessionKey);
  return stored ? JSON.parse(stored) : null;
}

// One table API for solo, pass-and-play and online tables. Each table answers a snapshot: {version, tableId, kind,
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
  const playerToken = tableTokens()[tableId] ?? (resume?.tableId === tableId ? resume.playerToken : null);
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
  async quickMatch(variant, playerName) {
    const access = await apiJson("/api/matchmaking/quick-match", jsonRequest("POST", { variant, playerName }));
    saveTableSession(access);
    return access;
  },
  async table(tableId) {
    return rememberSnapshot(await apiJson(`/api/tables/${tableId}`, jsonRequest("GET", undefined, tableId)));
  },
  async hint(tableId) {
    return apiJson(`/api/tables/${tableId}/hint`, jsonRequest("GET", undefined, tableId));
  },
  async act(tableId, action) {
    return rememberSnapshot(await apiJson(`/api/tables/${tableId}/actions`, jsonRequest("POST", action, tableId)));
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
  const sheet = onAuctionTable();
  const ids = sheet
    ? { pass: "#auction-pass", coinche: "#auction-coinche", contract: "#auction-bid", accept: "#auction-take", trumps: "#auction-trumps", value: "auction-value", suit: "auction-suit" }
    : { pass: "#pass-bid-button", coinche: "#coinche-button", contract: "#contract-bid-button", accept: "#accept-upturned-button", trumps: "#trump-options", value: "contract-value", suit: "contract-suit" };
  const bidButton = { pass: ids.pass, coinche: ids.coinche, contract: ids.contract }[action.type];
  let target = bidButton && document.querySelector(bidButton);
  if (action.type === "trump") {
    // In the first round the only trump to take is the upturned suit.
    const accept = document.querySelector(ids.accept);
    target = accept.hidden ? document.querySelector(`${ids.trumps} button[data-suit="${action.suit}"]`) : accept;
  } else if (action.type === "contract") {
    setChoice(ids.value, action.value);
    setChoice(ids.suit, action.suit);
    if (sheet) updateAuctionBid();
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
      document.querySelector(`${soloScreen().hand} [data-card="${hint.card.rank}-${hint.card.suit}"]`)?.classList.add("hint-card");
    }
    const reason = hint.reason === "TAKE"
      ? t("Take: strong hand in {0}", suitName(hint.action.suit, false))
      : t(hintReasons[hint.reason]);
    if (!bidding && soloScreen() === soloScreens.table) {
      tableToaster.push(reason, "hint");
    } else {
      const line = document.querySelector(bidding ? (onAuctionTable() ? "#auction-hint-reason" : "#bid-hint-reason") : "#hint-reason");
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

function closeTableStream() {
  if (!tableStream) return;
  window.clearTimeout(tableStream.timer);
  tableStream.source.close();
  tableStream = null;
}

function openTableStream(tableId, retry = 1000) {
  if (tableStream?.tableId === tableId) return;
  closeTableStream();
  const session = tableSession(tableId);
  if (!session) return;
  const source = new EventSource(`/api/tables/${tableId}/events?token=${encodeURIComponent(session.playerToken)}`);
  const stream = { tableId, source, retry, timer: null, refused: false };
  tableStream = stream;
  const reopen = () => {
    if (tableStream !== stream || stream.refused) return;
    closeTableStream();
    openTableStream(tableId, Math.min(stream.retry * 2, 30000));
  };
  source.addEventListener("open", () => {
    window.clearTimeout(stream.timer);
    stream.retry = 1000;
  });
  source.addEventListener("snapshot", (event) => {
    rememberSnapshot(JSON.parse(event.data));
    if (viewForPath(window.location.pathname) === "private-table" && privateTableId() === tableId) {
      loadPrivateTable(tableId);
    } else if (onlineTable() && currentRouteId() === tableId) {
      loadOnlineTable(tableId);
    }
  });
  source.addEventListener("error", (event) => {
    if (event.data) {
      // The server refused the stream: a bot keeps the seat.
      stream.refused = true;
      source.close();
      setSuitText(document.querySelector(onlineTable() ? "#lobby-message" : "#private-table-message"), t(JSON.parse(event.data).message));
      return;
    }
    window.clearTimeout(stream.timer);
    stream.timer = window.setTimeout(() => {
      if (source.readyState !== EventSource.OPEN) reopen();
    }, source.readyState === EventSource.CLOSED ? stream.retry : 10000);
  });
}

// The score bar above the table: each team's match score and round points, the target, and the viewer's team.
// The live region speaks only when its sentence changes, so tricks, repeated renders and the move from bidding to
// the card table stay silent; the sentence is forgotten only when the player leaves the game (see renderView).
const scoreBarViews = ["bidding", "bot-game", "table", "private-table"];
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
  leaveState = { kind: null, matchComplete: false };
  const activeView = viewForPath(window.location.pathname);
  // Bidding and play share one header (US-106): its status line keeps its text across the switch and is cleared elsewhere.
  const tableView = activeView === "bidding" || activeView === "bot-game" || activeView === "table";
  document.querySelector("#table-bar").hidden = !tableView;
  closeTableMenu(false);
  if (!tableView) {
    tableStatusText = null;
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

  if (activeView !== "private-table" && !onlineTable()) closeTableStream();
  document.querySelector(".table-menu-leave").setAttribute("href", tableExitPath());
  if (activeView === "bot-game") loadBotGame(currentRouteId());
  if (activeView === "table") {
    if (onlineTable()) loadOnlineTable(currentRouteId());
    else (onAuctionTable() ? loadAuction : loadTable)(currentRouteId());
  }
  if (activeView === "bidding") loadBidding(currentRouteId());
  if (activeView === "private-table") loadPrivateTable(privateTableId());
  if (activeView === "home") loadResumeCard();
  if (activeView === "private") loadOpenTables();
  if (activeView === "tutorial") showTutorialStep();
  if (activeView === "stats") loadStatistics();
  if (activeView === "leaderboard") loadLeaderboard();
  if (activeView === "privacy") loadPolicyInfo();
}
