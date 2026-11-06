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
  setExpression: setBotExpression,
  botEvents,
  expressionsFor,
  isThinking,
  onEvents: commentOnEvents
});

function viewForPath(path) {
  return routeFor(path).view;
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
  const playerToken = tableTokens()[tableId];
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
  const bidButton = {
    pass: "#pass-bid-button",
    coinche: "#coinche-button",
    contract: "#contract-bid-button"
  }[action.type];
  let target = bidButton && document.querySelector(bidButton);
  if (action.type === "trump") {
    // In the first round the only trump to take is the upturned suit.
    const accept = document.querySelector("#accept-upturned-button");
    target = accept.hidden ? document.querySelector(`#trump-options button[data-suit="${action.suit}"]`) : accept;
  } else if (action.type === "contract") {
    setChoice("contract-value", action.value);
    setChoice("contract-suit", action.suit);
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
      document.querySelector(`#card-hand [data-card="${hint.card.rank}-${hint.card.suit}"]`)?.classList.add("hint-card");
    }
    const line = document.querySelector(bidding ? "#bid-hint-reason" : "#hint-reason");
    setSuitText(line, hint.reason === "TAKE"
      ? t("Take: strong hand in {0}", suitName(hint.action.suit, false))
      : t(hintReasons[hint.reason]));
    line.hidden = false;
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
    }
  });
  source.addEventListener("error", (event) => {
    if (event.data) {
      // The server refused the stream: a bot keeps the seat.
      stream.refused = true;
      source.close();
      setSuitText(document.querySelector("#private-table-message"), t(JSON.parse(event.data).message));
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
const scoreBarViews = ["bidding", "bot-game", "private-table"];
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
  const tableView = activeView === "bidding" || activeView === "bot-game";
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
  // The settings link marks the page you are on.
  const settingsLink = document.querySelector(".settings-link");
  if (activeView === "settings") settingsLink.setAttribute("aria-current", "page");
  else settingsLink.removeAttribute("aria-current");
  document.title = activeView === "home"
    ? t("Beelot — Play Belote")
    : `${document.querySelector(`[data-view="${activeView}"] :is(h1, h2)`).textContent} — Beelot`;

  if (activeView !== "private-table") closeTableStream();
  if (activeView === "bot-game") loadBotGame(currentRouteId());
  if (activeView === "bidding") loadBidding(currentRouteId());
  if (activeView === "private-table") loadPrivateTable(privateTableId());
  if (activeView === "tutorial") showTutorialStep();
  if (activeView === "bot") showSetupStep(1);
  if (activeView === "stats") loadStatistics();
  if (activeView === "privacy") loadPolicyInfo();
}

// The policy's operator-specific values come from the server's environment; an unset one stays "not configured".
async function loadPolicyInfo() {
  let info = {};
  try {
    const response = await fetch("/api/privacy/policy-info");
    if (response.ok) info = await response.json();
  } catch (_) { /* keep "not configured" */ }
  const fill = (id, value) => { document.querySelector(id).textContent = value ?? t("not configured"); };
  fill("#privacy-controller", info.controller);
  fill("#privacy-contact", info.contact);
  fill("#privacy-hosting", info.hostingProvider);
  document.querySelector("#privacy-backup-days").textContent = info.backupRetentionDays
    ? t("Backups: overwritten after {0} days.", info.backupRetentionDays)
    : t("Backups: retention period not configured.");
}

function showTutorialStep() {
  const step = tutorialSteps[tutorialStep];
  document.querySelector("#tutorial-progress").textContent = t("Lesson {0} of {1}", tutorialStep + 1, tutorialSteps.length);
  document.querySelector("#tutorial-title").textContent = t(step.title);
  setSuitText(document.querySelector("#tutorial-prompt"), t(step.prompt));
  setSuitText(document.querySelector("#tutorial-feedback"), t("Choose a card to continue."));
  document.querySelector("#tutorial-next-button").disabled = true;
  document.querySelector("#tutorial-next-button").textContent = t(tutorialStep === tutorialSteps.length - 1 ? "Finish tutorial" : "Next lesson");
  document.querySelector("#tutorial-cards").replaceChildren(...step.cards.map((card, index) => {
    const option = cardElement(card);
    option.classList.add("tutorial-card");
    option.tabIndex = 0;
    option.addEventListener("click", () => chooseTutorialCard(index));
    return option;
  }));
}

function chooseTutorialCard(index) {
  const step = tutorialSteps[tutorialStep];
  const cards = document.querySelectorAll("#tutorial-cards .tutorial-card");
  cards.forEach((card, cardIndex) => card.classList.toggle("tutorial-correct", cardIndex === step.correct));
  playSound(index === step.correct ? "correct" : "wrong");
  setSuitText(document.querySelector("#tutorial-feedback"), t(index === step.correct ? step.feedback : "Not quite. Look at the highlighted card, then try the next lesson."));
  document.querySelector("#tutorial-next-button").disabled = false;
}

function seatTeam(position) {
  return position % 2 === 0 ? "North–South" : "East–West";
}

function seatHeader(position, label) {
  const header = document.createElement("div");
  const team = document.createElement("small");
  team.className = "seat-team";
  team.textContent = t(seatTeam(position));
  const name = document.createElement("strong");
  name.textContent = label;
  header.append(team, name);
  return header;
}

function createSeat(seat) {
  const item = document.createElement("div");
  item.className = "seat";
  const label = seat.you ? t("{0} (you)", playerName(seat.name)) : playerName(seat.name);
  const state = document.createElement("span");
  const connection = seat.connectionState === "BOT_TAKEOVER" ? t("Bot takeover") : seat.connectionState === "DISCONNECTED" ? t("Disconnected") : t("Connected");
  state.textContent = `${t(seat.ready ? "Ready" : "Waiting")} · ${connection}`;
  item.append(seatHeader(seat.position, label), state);
  return item;
}

// A waiting player may move to an empty seat, which decides who partners whom.
function createEmptySeat(tableId, position, canSit) {
  const item = document.createElement("div");
  item.className = "seat empty-seat";
  item.append(seatHeader(position, t("Empty seat")));
  if (canSit) {
    const sit = document.createElement("button");
    sit.className = "text-button";
    sit.type = "button";
    sit.textContent = t("Sit here");
    sit.setAttribute("aria-label", t("Sit in this {0} seat", t(seatTeam(position))));
    sit.addEventListener("click", () => chooseSeat(tableId, position));
    item.append(sit);
  }
  return item;
}

async function chooseSeat(tableId, position) {
  const session = getPrivateSession();
  if (!session || session.tableId !== tableId) return;
  try {
    showPrivateTable((await api.act(tableId, { type: "seat", position })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
}

function showPrivateTable(table) {
  const snapshot = JSON.stringify(table);
  if (snapshot === lastRenderedPrivateTableJson) return;
  lastRenderedPrivateTableJson = snapshot;
  privateTableSnapshot = table;
  const currentSeat = table.seats.find((seat) => seat.you);
  const isOwner = Boolean(currentSeat) && table.ownerPosition === currentSeat.position;
  const allReady = table.seats.length === 4 && table.seats.every((seat) => seat.ready);
  const allSeatedReady = table.seats.every((seat) => seat.ready);

  document.querySelector("#private-invitation-code").textContent = table.invitationCode;
  document.querySelector("#private-table-status").textContent = table.status === "IN_PROGRESS" ? t("Game started")
    : t(table.publicTable ? "Public table" : "Private table");
  document.querySelector('[data-view="private-table"] h1').textContent = table.status === "IN_PROGRESS"
    ? t(table.variantLabel) : t("Gather your team.");
  // Seats are laid out in table order on two columns, so each column holds one team.
  const canChooseSeat = Boolean(currentSeat) && !table.publicTable && table.status === "WAITING_FOR_PLAYERS";
  document.querySelector("#private-seat-list").replaceChildren(...[0, 1, 2, 3].map((position) => {
    const seat = table.seats.find((candidate) => candidate.position === position);
    return seat ? createSeat(seat) : createEmptySeat(table.id, position, canChooseSeat);
  }));
  const readyButton = document.querySelector("#ready-button");
  readyButton.hidden = !currentSeat || table.status === "IN_PROGRESS";
  readyButton.textContent = t(currentSeat?.ready ? "Not ready" : "I am ready");
  const startButton = document.querySelector("#start-private-game-button");
  startButton.hidden = !isOwner || table.status === "IN_PROGRESS";
  startButton.disabled = !allReady;
  const startWithBotsButton = document.querySelector("#start-with-bots-button");
  startWithBotsButton.hidden = !isOwner || table.status === "IN_PROGRESS" || table.seats.length === 4;
  startWithBotsButton.disabled = !allSeatedReady;
  const timerSettings = document.querySelector("#timer-settings");
  timerSettings.hidden = !isOwner || table.status === "IN_PROGRESS";
  setChoice("turn-timer", table.turnTimerSeconds);
  document.querySelector("#timer-policy").textContent = table.turnTimerSeconds
    ? t("Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by a bot.", table.turnTimerSeconds)
    : t("Turn timer is disabled.");
  const announcementSettings = document.querySelector("#announcement-settings");
  announcementSettings.hidden = !isOwner || table.status === "IN_PROGRESS";
  setChoice("table-announcements", table.announcements ? "on" : "off");
  document.querySelector("#announcements-summary").textContent =
    t(table.announcements ? "Announcements are on." : "Announcements are off.");
  privateAllTrumps = table.allTrumps;
  const allTrumpsSettings = document.querySelector("#all-trumps-settings");
  allTrumpsSettings.hidden = !isOwner || table.status === "IN_PROGRESS" || table.variant !== "CONTREE";
  setChoice("table-all-trumps", table.allTrumps ? "on" : "off");
  const allTrumpsSummary = document.querySelector("#all-trumps-summary");
  allTrumpsSummary.hidden = table.variant !== "CONTREE";
  allTrumpsSummary.textContent =
    t(table.allTrumps ? "Tout-atout and sans-atout are played." : "Only the four suits are played.");
  const targetSettings = document.querySelector("#target-settings");
  targetSettings.hidden = !isOwner || table.status === "IN_PROGRESS";
  setChoice("table-target", String(table.target));
  document.querySelector("#target-summary").textContent =
    t("The match is played to {0} points.", formatNumber(table.target));
  document.querySelector("#private-variant-summary").textContent = t("Variant: {0}", t(table.variantLabel));
  document.querySelector("#private-game-panel").hidden = table.status !== "IN_PROGRESS";
  document.querySelector("#private-lobby-help").hidden = table.status === "IN_PROGRESS";
  const waiting = table.status === "WAITING_FOR_PLAYERS";
  document.querySelector(".invitation-panel").hidden = table.publicTable;
  // Matchmaking tables start on their own: no invitation, ready step, owner controls or turn timer.
  document.querySelector("#timer-policy").hidden = table.publicTable;
  if (table.publicTable) {
    [readyButton, startButton, startWithBotsButton, timerSettings, announcementSettings, allTrumpsSettings, allTrumpsSummary,
      targetSettings, document.querySelector("#private-lobby-help")]
      .forEach((element) => { element.hidden = true; });
  }
  document.querySelector("#public-waiting").hidden = !(table.publicTable && waiting && currentSeat);
  document.querySelector("#leave-table-link").hidden = table.publicTable && waiting && Boolean(currentSeat);
  document.querySelector("#leave-table-link").setAttribute("href", table.publicTable ? "/online/public" : "/online/private");
  updatePublicCountdown();
  if (table.status === "IN_PROGRESS" && currentSeat) {
    const startingCards = table.variant === "CONTREE" ? 8 : 5;
    const seats = table.seats.map((seat, index) => ({
      name: seat.name, cardCount: startingCards, active: false,
      team: index % 2 === 0 ? "North–South" : "East–West"
    }));
    renderTableSeats("private", seats, table.seats.findIndex((seat) => seat.you));
    // The seats were redrawn: an auction in progress must be drawn again over them.
    lastRenderedPrivateBiddingJson = "";
  }
  document.querySelector("#private-table-message").textContent = table.status === "IN_PROGRESS"
    ? t("The game has started. Calls and card play update for every player automatically.")
    : "";
  if (table.status !== "IN_PROGRESS") {
    privateAuctionShown = { auctionId: null, count: 0 };
    shownContract.private = null;
  }
}

function updatePublicCountdown() {
  const table = privateTableSnapshot;
  if (!table?.publicTable || !table.botFillAt) return;
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(table.botFillAt) - Date.now()) / 1000));
  document.querySelector("#public-waiting-message").textContent =
    t("Looking for players… bots take the empty seats in {0} s.", secondsLeft);
}

// A signed-in player's requests that change state must echo the CSRF token the server sets in a cookie.
function withCsrfToken(options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return options;
  const token = document.cookie.split("; ").find((cookie) => cookie.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
  if (!token) return options;
  return { ...options, headers: { ...options.headers, "X-XSRF-TOKEN": decodeURIComponent(token) } };
}

async function apiJson(url, options) {
  const response = await fetch(url, withCsrfToken(options));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(t(body.message ?? "Something went wrong. Please try again."));
    error.status = response.status;
    throw error;
  }
  return body;
}

// The version of the online table on screen; a newer snapshot is drawn once the calls being revealed are shown.
let renderedPrivateVersion = { tableId: null, version: -1 };

async function loadPrivateTable(tableId) {
  // Calls are revealed one by one; the next refresh picks up whatever happened meanwhile.
  if (privateAuctionRevealing) return;
  const requestId = ++privateTableRequestId;
  try {
    const session = getPrivateSession();
    const snapshot = await currentSnapshot(tableId);
    if (requestId !== privateTableRequestId) return;
    openTableStream(tableId);
    const table = snapshot.table;
    showPrivateTable(table);
    if (table.status === "IN_PROGRESS") await loadPrivateGame(tableId, table.variant, requestId, snapshot);
    else if (privateTableOnScreen(tableId)) hideScoreBar();
    document.querySelector("#private-reaction-bar").hidden = table.status !== "IN_PROGRESS" || !reactionsEnabled()
      || session?.tableId !== tableId;
    if (table.status === "IN_PROGRESS") loadReactions(tableId, snapshot.reactions);
    if (requestId === privateTableRequestId) renderedPrivateVersion = { tableId, version: snapshot.version };
  } catch (error) {
    if (requestId !== privateTableRequestId) return;
    const home = tableHomePath();
    document.querySelector(home === "/online/public" ? "#public-form-message" : "#private-form-message").textContent =
      t("That table is no longer available.");
    navigate(home, { replace: true });
  }
}

async function loadPrivateGame(tableId, variant, requestId = ++privateTableRequestId, known = null) {
  const session = getPrivateSession();
  if (!session) return;
  const panel = document.querySelector("#private-game-panel");
  panel.hidden = false;
  const snapshot = known ?? await currentSnapshot(tableId);
  if (requestId !== privateTableRequestId) return;
  const match = snapshot.match ?? null;
  leaveState = { kind: "online", matchComplete: Boolean(match?.complete) };
  if (snapshot.bidding) {
    const seats = snapshot.table.seats.map((seat, index) => ({
      name: seat.name,
      team: index % 2 === 0 ? "North–South" : "East–West"
    }));
    botExpressionState.updateBidding("private", seats, snapshot.bidding, match);
  }
  if (snapshot.board) {
    // The auction ended since the last refresh: reveal its closing calls before the cards are played.
    if (privateGameStage === "bidding" && snapshot.bidding) {
      await renderPrivateBidding(snapshot.bidding, variant);
      if (requestId !== privateTableRequestId) return;
    }
    renderPrivateBoard(tableId, snapshot.board, match, snapshot.you);
  } else if (snapshot.bidding) {
    // The match score is shown during the auction too, without round points.
    showPrivateScoreBar(tableId, match, null, snapshot.you);
    // A rematch by another seat: the finished match's screen must not stay over the new auction.
    resetMatchEnd(`private:${tableId}`);
    await renderPrivateBidding(snapshot.bidding, variant);
  }
}

// Calls of the private auction made since the player last looked, in the order they were made.
function unrevealedPrivateCalls(bidding) {
  const shown = privateAuctionShown;
  privateAuctionShown = { auctionId: bidding.auctionId, count: bidding.auction.length };
  if (!shown) return { calls: [], revealed: bidding.auction.length };
  const revealed = shown.auctionId === bidding.auctionId ? Math.min(shown.count, bidding.auction.length) : 0;
  return { calls: bidding.auction.slice(revealed), revealed };
}

function renderPrivateBiddingSeats(bidding, revealedCount) {
  if (!privateTableSnapshot) return;
  const currentPlayerIndex = privateTableSnapshot.seats.findIndex((seat) => seat.you);
  const ownName = privateTableSnapshot.seats[currentPlayerIndex]?.name;
  const revealed = bidding.auction.slice(0, revealedCount);
  // What the table shows: the revealed calls, plus the viewer's own call once it has been shown.
  const shownCalls = bidding.auction.filter((call, index) =>
    index < revealedCount || (privateOwnCallShown && call.playerName === ownName));
  const seats = privateTableSnapshot.seats.map((seat, index) => ({
    name: seat.name,
    cardCount: bidding.hand.length,
    active: seat.name === bidding.activePlayer,
    dealer: index === bidding.dealerIndex,
    team: index % 2 === 0 ? "North–South" : "East–West",
    call: (seat.name === ownName ? shownCalls : revealed)
      .findLast((call) => call.playerName === seat.name)?.call ?? ""
  }));
  renderTableSeats("private", seats, currentPlayerIndex < 0 ? 0 : currentPlayerIndex, contractFromAuction(shownCalls));
  return seats;
}

// Shows each new call as at the bot table: the caller thinks, then their call appears and is narrated.
async function revealPrivateCalls(calls) {
  const panel = document.querySelector("#private-game-panel");
  const ownName = document.querySelector("#private-player-bottom").dataset.playerName;
  privateAuctionRevealing = true;
  panel.classList.add("auction-waiting-view");
  try {
    for (const call of calls) {
      if (call.playerName === ownName && privateOwnCallShown) {
        privateOwnCallShown = false;
        continue;
      }
      // A player may repeat their previous call (a second pass): it is still a new decision to show.
      callStation("private", call.playerName, false)?.querySelector(".player-call:not(.player-thinking)")?.remove();
      await announceCall("private", call.playerName, call.call);
    }
  } finally {
    panel.classList.remove("auction-waiting-view");
    privateAuctionRevealing = false;
  }
}

// While another player decides, their seat keeps the thinking spotlight.
function showPrivateThinking(bidding) {
  stopPrivateThinking();
  stopPrivateThinking = () => {};
  if (bidding.complete || bidding.playerTurn) return;
  const station = callStation("private", bidding.activePlayer, false);
  if (station) stopPrivateThinking = showThinking(station);
}

async function renderPrivateBidding(bidding, variant) {
  const snapshot = variant + JSON.stringify(bidding);
  if (snapshot === lastRenderedPrivateBiddingJson) return;
  lastRenderedPrivateBiddingJson = snapshot;
  privateGameStage = bidding.complete ? "" : "bidding";
  stopPrivateThinking();
  const { calls, revealed } = unrevealedPrivateCalls(bidding);
  const seats = renderPrivateBiddingSeats(bidding, revealed);
  if (seats) botExpressionState.updateBidding("private", seats, bidding);
  document.querySelector("#private-game-heading").textContent = variant === "CONTREE" ? t("Contrée auction") : t("Choose trump");
  const privateTrick = document.querySelector("#private-current-trick");
  privateTrick.replaceChildren(...(bidding.upturnedCard ? [cardElement(bidding.upturnedCard)] : []));
  if (!bidding.upturnedCard) privateTrick.textContent = t("No upturned card in Contrée.");
  document.querySelector("#private-game-hand").replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));
  document.querySelector("#private-auction-actions").hidden = false;
  document.querySelector("#private-play-status").hidden = true;
  document.querySelector("#private-declaration-message").textContent = "";
  document.querySelector("#private-round-result").hidden = true;
  document.querySelector("#private-card-table").hidden = false;
  updateAmountChoices("private-contract-value", bidding.highestBid);
  document.querySelector("#private-bid-button").hidden = variant !== "CONTREE";
  document.querySelector("#private-coinche-button").hidden = !bidding.coincheAllowed;
  document.querySelector("#private-trump-button").hidden = variant === "CONTREE";
  document.querySelector("#private-trump-button").textContent = t(bidding.round === 1 ? "Accept upturned suit" : "Choose trump");
  document.querySelector("#private-contract-value-field").hidden = variant !== "CONTREE";
  document.querySelector("#private-bid-button").disabled = !bidding.playerTurn || bidding.highestBid >= 160;
  document.querySelector("#private-trump-button").disabled = !bidding.playerTurn;
  document.querySelector("#private-pass-button").disabled = !bidding.playerTurn;
  // Classic Belote: round 1 only allows the upturned suit, round 2 forbids it.
  const upturnedSuit = bidding.upturnedCard?.suit;
  choiceInputs("private-contract-suit").forEach((input) => {
    input.disabled = variant !== "CONTREE" && Boolean(upturnedSuit)
      && (bidding.round === 1 ? input.value !== upturnedSuit : input.value === upturnedSuit);
  });
  offerAllTrumpChoices("private-contract-suit", variant === "CONTREE" && privateAllTrumps);
  if (calls.length) await revealPrivateCalls(calls);
  setSuitText(document.querySelector("#private-game-message"), t(bidding.message));
  showPrivateThinking(bidding);
}

// Whether the player still looks at this table: a snapshot that arrives after they left must not draw over another view.
function privateTableOnScreen(tableId) {
  return viewForPath(window.location.pathname) === "private-table" && privateTableId() === tableId;
}

// `you` is the viewer's seat, or null when they hold none: then no team is marked "You".
function showPrivateScoreBar(tableId, match, board, you) {
  if (privateTableOnScreen(tableId)) showScoreBar(match, board, you == null ? null : you % 2);
}

function renderPrivateBoard(tableId, board, match, you) {
  // Before the unchanged-snapshot check: renderView hides the bar, and coming back to the table must show it again.
  showPrivateScoreBar(tableId, match, board, you);
  botExpressionState.updateBoard("private", board, match);
  const snapshot = JSON.stringify({ board, match });
  if (snapshot === lastRenderedPrivateBoardJson) return;
  lastRenderedPrivateBoardJson = snapshot;
  privateGameStage = "board";
  stopPrivateThinking();
  document.querySelector("#private-game-heading").textContent = board.variant === "CONTREE" ? t("Contrée") : t("Classic Belote");
  setSuitText(document.querySelector("#private-game-message"), board.roundResult
    ? t(board.roundResult.contractMade ? "Contract made." : "Contract failed.")
    : t("{0}'s turn · {1} of 8 tricks completed", playerName(board.activePlayer), board.completedTricks));
  document.querySelector("#private-auction-actions").hidden = true;
  document.querySelector("#private-play-status").hidden = false;
  document.querySelector("#private-card-table").hidden = false;
  renderTableSeats("private", board.seats.map((seat, index) => ({ ...seat, dealer: index === board.dealerIndex })),
    board.currentPlayerIndex, contractFromBoard(board));
  document.querySelector("#private-declaring-team").textContent = t(board.declaringTeam);
  document.querySelector("#private-active-player").textContent = playerName(board.activePlayer);
  setSuitText(document.querySelector("#private-declaration-message"), board.declarationMessage
    ? `${t(board.declarationMessage)}${board.beloteBonusPoints ? t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints) : ""}` : "");
  celebrateBelote(document.querySelector("#private-card-table"), `private:${tableId}`, board);
  renderAnnouncements("private-", board);
  const privateTrick = document.querySelector("#private-current-trick");
  renderTrickDiamond(privateTrick, board.currentTrick, board.seats, board.activePlayerIndex, board.currentPlayerIndex,
    board.reviewingCompletedTrick ? { winner: board.trickWinner, points: board.trickPoints } : null);
  fillHand(document.querySelector("#private-game-hand"), board, (card) => privatePlayCard(tableId, card));
  // The server collects the trick once everyone had time to see it; refresh as soon as that time is up.
  const trickKey = `${tableId}:${board.completedTricks}`;
  if (board.reviewingCompletedTrick && !board.roundResult && pendingPrivateTrickRefresh !== trickKey) {
    pendingPrivateTrickRefresh = trickKey;
    window.setTimeout(() => {
      pendingPrivateTrickRefresh = "";
      if (privateTableId() === tableId) loadPrivateTable(tableId);
    }, Number(privateTrick.dataset.revealMs || 0) + trickHoldDelay + 400);
  }
  const result = document.querySelector("#private-round-result");
  revealAfterTrick(result, privateTrick, Boolean(board.roundResult));
  if (board.roundResult) {
    document.querySelector("#private-contract-result").textContent = t(board.roundResult.contractMade
      ? "Contract made" : "Contract failed");
    document.querySelector("#private-score-breakdown").textContent = roundScoreText(board.roundResult, board);
    document.querySelector("#private-next-round-button").hidden = Boolean(match?.complete);
    document.querySelector("#private-rematch-button").hidden = true;
    document.querySelector("#private-results-button").hidden = !match?.complete;
    const reviewButton = document.querySelector("#private-review-button");
    reviewButton.hidden = !board.roundResult.review?.length;
    reviewButton.onclick = () => openRoundReview(board, board.roundResult);
    if (match?.complete) {
      document.querySelector("#private-contract-result").textContent = t("{0} win the match!", t(match.winner));
    }
    celebrateRound(privateTrick, document.querySelector("#private-card-table"), board.roundResult, board, match);
    celebrateMatchEnd(privateTrick, `private:${tableId}`, board, match, Promise.resolve(),
      () => document.querySelector("#private-rematch-button").click());
  } else {
    resetMatchEnd(`private:${tableId}`);
  }
}

async function privateAction(action) {
  const session = getPrivateSession();
  if (!session) return;
  const auctionAction = ["pass", "contract", "coinche", "trump"].includes(action.type);
  const privatePanel = document.querySelector("#private-game-panel");
  if (auctionAction) privatePanel.classList.add("auction-waiting-view");
  try {
    if (auctionAction) {
      callStation("private", null, true)?.querySelector(".player-call:not(.player-thinking)")?.remove();
      showPlayerCall("private", null, callLabel(action.type, action), true);
      privateOwnCallShown = true;
      await pause(ownCallDelay);
    }
    await api.act(session.tableId, action);
    await loadPrivateTable(session.tableId);
  } catch (error) {
    privateOwnCallShown = false;
    // A refused call must not stay on the table: redraw the auction as the server holds it, then show the error.
    if (auctionAction) await loadPrivateTable(session.tableId);
    document.querySelector("#private-game-message").textContent = error.message;
  } finally {
    if (auctionAction) privatePanel.classList.remove("auction-waiting-view");
  }
}

function privatePlayCard(tableId, card) {
  privateAction({ type: "card", rank: card.rank, suit: card.suit, declare: declareChoice("private-") });
}

function roundScoreText(round, board) {
  const capot = !round.capotTeam ? ""
    : board.variant === "CONTREE" && round.capotTeam === board.declaringTeam
      ? `${t("Capot! {0} take every trick and score 250 plus their {1} bid.", t(round.capotTeam), board.contractValue)} `
      : `${t("Capot! {0} take every trick and score 250.", t(round.capotTeam))} `;
  const detail = capot + t("North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.",
    round.northSouthCardPoints, round.northSouthDixDeDer, round.northSouthBeloteBonus, round.northSouthAwarded,
    round.eastWestCardPoints, round.eastWestDixDeDer, round.eastWestBeloteBonus, round.eastWestAwarded);
  const announcements = board.announcements ? ` ${announcementsLine(round, board)}` : "";
  return (board.coinched ? t("Coinche doubles the awarded scores. {0}", detail) : detail) + announcements;
}

// Announcements (US-060): the option to declare on the first card, who declared during the first trick, what they
// declared once it is over, and the points in the round breakdown. The prefix tells the solo board from the private one.
const carreRanks = { J: "jacks", 9: "nines", A: "aces", 10: "tens", K: "kings", Q: "queens" };
const sequenceNames = { TIERCE: "Tierce to the {0}", CINQUANTE: "Cinquante to the {0}", CENT: "Cent to the {0}" };

function announcementName(announcement) {
  return announcement.kind === "CARRE"
    ? t("Carré of {0}", t(carreRanks[announcement.cards[0].rank]))
    : t(sequenceNames[announcement.kind], cardName(announcement.topCard));
}

function declareChoice(prefix) {
  return !document.querySelector(`#${prefix}declare-option`).hidden
    && document.querySelector(`#${prefix}declare-announcements`).checked;
}

function renderAnnouncements(prefix, board) {
  const own = board.ownAnnouncements || [];
  const option = document.querySelector(`#${prefix}declare-option`);
  // A new round ticks the option again.
  if (option.hidden && own.length) document.querySelector(`#${prefix}declare-announcements`).checked = true;
  option.hidden = own.length === 0;
  document.querySelector(`#${prefix}declare-label`).textContent =
    t("Declare: {0}", own.map(announcementName).join(", "));
  const declarers = board.declarers || [];
  const note = document.querySelector(`#${prefix}declarers-note`);
  note.hidden = declarers.length === 0;
  note.textContent = declarers.map((name) => t("{0} declares.", playerName(name))).join(" ");
  const revealed = board.revealedAnnouncements || [];
  const panel = document.querySelector(`#${prefix}announcements-panel`);
  // The reveal belongs to the pause after the first trick; the points then stay in the live score.
  panel.hidden = revealed.length === 0 || !(board.completedTricks === 1 && board.reviewingCompletedTrick);
  if (panel.hidden) return;
  const items = revealed.map((declaration) => {
    const item = document.createElement("li");
    item.classList.toggle("scored", declaration.scored);
    const label = document.createElement("span");
    label.textContent = `${playerName(declaration.player)}: ${declaration.announcements.map(announcementName).join(", ")}`;
    const cards = document.createElement("span");
    cards.className = "announcement-cards";
    cards.append(...declaration.announcements.flatMap((announcement) => announcement.cards).map(cardElement));
    item.append(label, cards);
    return item;
  });
  const scoring = revealed.filter((declaration) => declaration.scored);
  const points = scoring.flatMap((declaration) => declaration.announcements)
    .reduce((sum, announcement) => sum + announcement.value, 0);
  const total = document.createElement("li");
  total.className = "announcements-total";
  total.textContent = t("{0} score {1} points of announcements.", t(scoring[0].team), points);
  document.querySelector(`#${prefix}announcements-list`).replaceChildren(...items, total);
}

function announcementsLine(round, board) {
  const points = round.northSouthAnnouncements || round.eastWestAnnouncements;
  if (!points) return t("Announcements: none.");
  const team = round.northSouthAnnouncements ? "North–South" : "East–West";
  const kinds = (board.revealedAnnouncements || []).filter((declaration) => declaration.scored)
    .flatMap((declaration) => declaration.announcements)
    .map((announcement) => t(announcement.kind === "CARRE" ? "carré" : announcement.kind.toLowerCase()));
  // A failed contract hands every announcement that scored to the defence.
  const defence = board.declaringTeam === "North–South" ? "East–West" : "North–South";
  return round.contractMade || team === defence
    ? t("Announcements: {0} {1} ({2}).", t(team), points, kinds.join(" + "))
    : t("Announcements: {0} {1} ({2}), which go to {3}.", t(team), points, kinds.join(" + "), t(defence));
}

function enterPrivateTable(access, basePath = "/online/private") {
  window.sessionStorage.setItem(privateSessionKey, JSON.stringify({
    tableId: access.tableId,
    playerToken: access.playerToken
  }));
  navigate(`${basePath}/table/${access.tableId}`);
}

// In pass and play, a cover hides every card until the human whose hand is shown says they hold the device.
let handoffShownTo = "";
let handoffResolve = null;

function handOff(game, viewerName) {
  const key = `${game.id}:${viewerName}`;
  if (!game.passAndPlay || handoffShownTo === key) return Promise.resolve();
  const cover = document.querySelector("#handoff");
  document.querySelector("#handoff-title").textContent = t("Pass the device to {0}", viewerName);
  sheets.openSheet(cover, { dismissible: false });
  document.querySelector("#handoff-ready").focus();
  return new Promise((resolve) => {
    handoffResolve = () => {
      handoffShownTo = key;
      sheets.closeSheet(cover);
      resolve();
    };
  });
}

document.querySelector("#handoff-ready").addEventListener("click", () => {
  const resolve = handoffResolve;
  handoffResolve = null;
  resolve?.();
});

// The table header's single status line (US-106). It is written only when its text changes, so the live region does
// not repeat itself on every render; errors go through it too, and the next render replaces them.
let tableStatusText = null;
function setTableStatus(text) {
  if (text === tableStatusText) return;
  tableStatusText = text;
  setSuitText(document.querySelector("#table-status"), text);
}

// The turn text of the last render: what the status line goes back to once a flashed message is over.
let turnStatusText = "";
function showTableStatus(state) {
  const { text, args } = tableStatus(state);
  turnStatusText = t(text, ...args.map(playerName));
  window.clearTimeout(handReasonTimer);
  setTableStatus(turnStatusText);
}

// A short message in the status line (US-107): it never covers the felt, and the turn text comes back after `ms`.
function flashTableStatus(text, ms) {
  setTableStatus(text);
  window.clearTimeout(handReasonTimer);
  handReasonTimer = window.setTimeout(() => setTableStatus(turnStatusText), ms);
}

function showBotStatus(board, game, dealing) {
  showTableStatus({
    phase: "play",
    roundOver: Boolean(board.roundResult),
    dealing,
    reviewingTrick: board.reviewingCompletedTrick,
    trickWinner: board.trickWinner,
    myTurn: board.activePlayerIndex === board.currentPlayerIndex,
    activeName: board.activePlayer,
    passAndPlay: game.passAndPlay
  });
}

// The table being played, for the "Leave this table?" question (US-110); set by the loaders, cleared on each view change.
let leaveState = { kind: null, matchComplete: false };

// Asks before leaving a table in the middle of a match. Returns true when it is asking, so the caller does not navigate yet.
const navigate = makeNavigate({ history: window.history, askToLeave: (destination) => askToLeave(destination), render: () => renderView() });

function askToLeave(destination) {
  const question = leaveConfirmation(leaveState);
  if (!question) return false;
  document.querySelector("#leave-dialog-title").textContent = t(question.title);
  document.querySelector("#leave-dialog-message").textContent = t(question.message);
  const dialog = document.querySelector("#leave-dialog");
  dialog.dataset.destination = destination;
  sheets.openSheet(dialog, { routed: false, opener: document.activeElement });
  return true;
}

document.querySelector("#leave-stay-button").addEventListener("click", () => sheets.closeSheet(document.querySelector("#leave-dialog")));
document.querySelector("#leave-confirm-button").addEventListener("click", () => {
  const dialog = document.querySelector("#leave-dialog");
  const destination = dialog.dataset.destination;
  sheets.closeSheet(dialog);
  navigate(destination);
});

// The header's menu (Hint, Rules, Leave) is a disclosure: Escape and a click outside close it.
function closeTableMenu(returnFocus) {
  const toggle = document.querySelector("#table-menu-toggle");
  if (toggle.getAttribute("aria-expanded") !== "true") return;
  toggle.setAttribute("aria-expanded", "false");
  document.querySelector("#table-menu").hidden = true;
  if (returnFocus) toggle.focus();
}

document.querySelector("#table-menu-toggle").addEventListener("click", (event) => {
  const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
  event.currentTarget.setAttribute("aria-expanded", String(open));
  document.querySelector("#table-menu").hidden = !open;
});
document.querySelector("#table-menu").addEventListener("click", () => closeTableMenu(true));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTableMenu(true);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#table-bar")) closeTableMenu(false);
});

async function loadBotGame(gameId) {
  try {
    const snapshot = await api.table(gameId);
    const game = localGame(snapshot);
    const { board, match } = snapshot;
    if (!board) throw new Error("The auction has not finished.");
    leaveState = { kind: "solo", matchComplete: Boolean(match?.complete) };
    const handedOff = handOff(game, board.currentPlayer);
    offerHint("#table-hint-button", gameId, snapshot.table.hints && board.activePlayerIndex === board.currentPlayerIndex
      && !board.reviewingCompletedTrick && !board.roundResult);
    document.querySelector("#selected-difficulty").textContent = t(game.difficultyLabel);
    document.querySelector("#selected-variant").textContent = t(game.variantLabel);
    document.querySelector("#game-variant-title").textContent = t(game.variantLabel);
    // In pass and play, "You" waits for the hand-off, so the bar does not tell who holds the device next.
    if (window.location.pathname === `/play/bot/game/${gameId}`) {
      showScoreBar(match, board, game.passAndPlay ? null : board.currentPlayerIndex % 2);
    }
    setSuitText(document.querySelector("#declaration-message"), t(board.declarationMessage || "")
      + (board.beloteBonusPoints ? t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints) : ""));
    celebrateBelote(document.querySelector("#bot-card-table"), `bot:${gameId}`, board, handedOff);
    renderAnnouncements("", board);
    document.querySelector("#completed-tricks").textContent = board.completedTricks;
    const currentTrick = document.querySelector("#current-trick");
    const secondDeal = pendingSecondDeal?.gameId === gameId && pendingSecondDeal.viewer === board.currentPlayer
      && !motionReduced() ? pendingSecondDeal : null;
    pendingSecondDeal = null;
    const showTrick = () => {
      renderTrickDiamond(currentTrick, board.currentTrick, board.seats, board.activePlayerIndex, board.currentPlayerIndex,
        board.reviewingCompletedTrick ? { winner: board.trickWinner, points: board.trickPoints } : null, "");
      showBotStatus(board, game, false);
      if (board.reviewingCompletedTrick && !board.roundResult) collectBotTrickLater(gameId, board.completedTricks, currentTrick);
    };
    if (secondDeal) {
      currentTrick.replaceChildren();
      showBotStatus(board, game, true);
    } else {
      showTrick();
    }
    const result = document.querySelector("#round-result");
    revealAfterTrick(result, currentTrick, Boolean(board.roundResult));
    if (board.roundResult) {
      const round = board.roundResult;
      document.querySelector("#contract-result").textContent = t(round.contractMade ? "Contract made" : "Contract failed");
      document.querySelector("#round-score-breakdown").textContent = roundScoreText(round, board);
      document.querySelector("#next-round-button").hidden = match.complete;
      document.querySelector("#rematch-button").hidden = true;
      document.querySelector("#results-button").hidden = !match.complete;
      const reviewButton = document.querySelector("#review-button");
      reviewButton.hidden = !round.review?.length;
      reviewButton.onclick = () => openRoundReview(board, round);
      if (match.complete) document.querySelector("#contract-result").textContent = t("{0} win the match!", t(match.winner));
      celebrateRound(currentTrick, document.querySelector("#bot-card-table"), round, board, match, handedOff);
      celebrateMatchEnd(currentTrick, `bot:${gameId}`, board, match, handedOff,
        () => document.querySelector("#rematch-button").click());
    } else {
      resetMatchEnd(`bot:${gameId}`);
    }
    const seatsForBoard = (cardCount) => board.seats.map((seat, index) => ({
      ...seat, dealer: index === board.dealerIndex, cardCount: cardCount ?? seat.cardCount
    }));
    const seats = seatsForBoard(secondDeal ? secondDeal.hand.length : undefined);
    renderTableSeats("bot", seats, board.currentPlayerIndex, contractFromBoard(board));
    if (snapshot.bidding) botExpressionState.updateBidding("bot", seats, snapshot.bidding, match);
    botExpressionState.updateBoard("bot", board, match);
    fillHand(document.querySelector("#card-hand"), board, (card) => playCard(gameId, card));
    await handedOff;
    if (window.location.pathname === `/play/bot/game/${gameId}`) showScoreBar(match, board, board.currentPlayerIndex % 2);
    if (secondDeal) await playSecondDeal(board, secondDeal.hand, seatsForBoard, showTrick);
  } catch (error) {
    navigate("/play/bot", { replace: true });
  }
}

// After the auction, everyone receives three more cards; the taker gets two plus the upturned card.
async function playSecondDeal(board, previousHand, seatsForBoard, showTrick) {
  const handElement = document.querySelector("#card-hand");
  const known = new Set(previousHand.map((card) => `${card.rank}-${card.suit}`));
  const cards = [...handElement.children];
  const orderedCards = orderHandForDisplay(board.hand, board.trump);
  cards.forEach((card, index) => {
    if (!known.has(`${orderedCards[index].rank}-${orderedCards[index].suit}`)) card.classList.add("undealt");
  });
  const seatNames = board.seats.map((seat) => seat.name);
  // The taker receives the upturned card and two more; everyone else receives three.
  const takerIndex = board.declaringPlayerIndex;
  await dealCards({
    prefix: "bot", seatNames, dealerIndex: board.dealerIndex, startCount: previousHand.length, handElement,
    steps: [
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 2 : 3)) },
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 1 : 0)), fromCenter: true }
    ]
  });
  renderTableSeats("bot", seatsForBoard(), board.currentPlayerIndex, contractFromBoard(board));
  showTrick();
}

async function playCard(gameId, card) {
  clearHint();
  try {
    await api.act(gameId, { type: "card", rank: card.rank, suit: card.suit, declare: declareChoice("") });
    loadBotGame(gameId);
  } catch (error) {
    setTableStatus(error.message);
  }
}

// Collects a completed trick once it has been on the table long enough to be seen.
function collectBotTrickLater(gameId, completedTricks, container) {
  const key = `${gameId}:${completedTricks}`;
  if (pendingTrickCollection === key) return;
  pendingTrickCollection = key;
  window.setTimeout(async () => {
    if (pendingTrickCollection !== key || window.location.pathname !== `/play/bot/game/${gameId}`) return;
    pendingTrickCollection = "";
    try {
      await api.act(gameId, { type: "continueTrick" });
      loadBotGame(gameId);
    } catch (_) {
      // The trick was already collected; the table is up to date.
    }
  }, Number(container.dataset.revealMs || 0) + trickHoldDelay);
}

document.querySelector("#next-round-button").addEventListener("click", async () => {
  const gameId = currentRouteId();
  await api.act(gameId, { type: "nextRound" });
  lastDealKey = "";
  navigate(`/play/bot/bidding/${gameId}`);
});

document.querySelector("#results-button").addEventListener("click", () => {
  reopenMatchEnd(`bot:${currentRouteId()}`);
});

document.querySelector("#rematch-button").addEventListener("click", async () => {
  const gameId = currentRouteId();
  resetMatchEnd(`bot:${gameId}`);
  await api.act(gameId, { type: "rematch" });
  lastDealKey = "";
  navigate(`/play/bot/bidding/${gameId}`);
});

document.querySelector("#tutorial-next-button").addEventListener("click", () => {
  if (tutorialStep === tutorialSteps.length - 1) {
    markTutorialSeen(window.localStorage);
    updateTutorialBanner();
  }
  tutorialStep = (tutorialStep + 1) % tutorialSteps.length;
  showTutorialStep();
});
document.querySelector("#tutorial-replay-button").addEventListener("click", () => {
  tutorialStep = 0;
  showTutorialStep();
});

function suitSymbol(suit) {
  const name = String(suit).toLowerCase();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `suit suit-${name}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `/suits.svg#suit-${name}`);
  svg.append(use);
  return svg;
}

// Shows `text` in `element` with a symbol before each suit name. Returns the suit keys found, in order.
// With `symbolOnly` the name stays for screen readers but is hidden on screen.
function setSuitText(element, text, { symbolOnly = false } = {}) {
  const nodes = [];
  const suits = [];
  for (const part of splitSuitText(text, suitWordMap())) {
    if (typeof part === "string") {
      nodes.push(part);
      continue;
    }
    suits.push(part.suit);
    const symbol = suitSymbol(part.suit);
    symbol.classList.add("suit-inline");
    if (symbolOnly) {
      const word = document.createElement("span");
      word.className = "visually-hidden";
      word.textContent = part.word;
      nodes.push(symbol, word);
    } else {
      const withName = document.createElement("span");
      withName.className = "suit-with-name";
      withName.append(symbol, ` ${part.word}`);
      nodes.push(withName);
    }
  }
  element.replaceChildren(...nodes);
  return suits;
}

// Where the card the player just tapped sat, so the trick can fly it from there. Used once, if fresh.
let handOrigin = null;

const plainBox = (rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

function rememberHandOrigin(item, card) {
  handOrigin = { key: `${card.rank}-${card.suit}`, box: plainBox(item.getBoundingClientRect()), at: performance.now() };
}

// The box a new trick card flies in from: the tapped hand card for the viewer's own seat, the seat's avatar
// for the others; null (today's arrival animation) when it is not known, e.g. after a reload.
function flightOrigin(table, key, placement) {
  if (placement === "bottom") {
    const origin = handOrigin;
    handOrigin = null;
    return origin && origin.key === key && performance.now() - origin.at < 5000 ? origin.box : null;
  }
  const rect = table?.querySelector(`.station-${placement} .player-avatar`)?.getBoundingClientRect();
  return rect?.width ? plainBox(rect) : null;
}

// Once the trick is in the page, gives each newly played card the offset to fly in from. Measured on the
// slot, because the card itself already carries the start of its arrival animation.
function launchFlights(container, flights) {
  const table = container.closest(".card-table");
  for (const { card, key, placement } of flights) {
    const origin = flightOrigin(table, key, placement);
    if (!origin) continue;
    const { x, y } = flightVector(origin, plainBox(card.parentElement.getBoundingClientRect()));
    card.style.setProperty("--fly-x", `${x}px`);
    card.style.setProperty("--fly-y", `${y}px`);
    card.classList.add("flies");
  }
}

let handReasonTimer = null;

function clearHandReasons() {
  window.clearTimeout(handReasonTimer);
  handReasonTimer = null;
  document.querySelectorAll(".hand-reason").forEach((reason) => reason.replaceChildren());
  if (turnStatusText) setTableStatus(turnStatusText);
}

// Shakes an unplayable card and says why in the hand's status line; the reason shows at every effects
// level, the shake follows it.
function rejectCard(handElement, item, entry, trump) {
  item.classList.remove("card-shake");
  void item.offsetWidth;
  item.classList.add("card-shake");
  window.setTimeout(() => item.classList.remove("card-shake"), 400);
  const { key, suit } = reasonText(entry, trump);
  const message = t(key, suit ? suitName(suit, false) : "");
  const reason = handElement.parentElement.querySelector(".hand-reason");
  // The solo table says it in the header's status line; the private table has no such line and keeps its bubble.
  if (!reason) {
    flashTableStatus(message, 3000);
    return;
  }
  setSuitText(reason, message);
  window.clearTimeout(handReasonTimer);
  handReasonTimer = window.setTimeout(clearHandReasons, 3000);
}

// Sets how a hand is laid out on a portrait phone (US-108): its columns and rows, which the pill above it follows.
function layoutHand(handElement, count) {
  const { cols, rows } = handLayout(count);
  handElement.style.setProperty("--hand-cols", cols);
  handElement.dataset.rows = rows;
}

// Fills a hand with the board's cards in display order. Each card carries its place in the fan
// (--fan-rot, --fan-y); a legal card is lifted and plays through `play(card)` on a click or Enter/Space.
function fillHand(handElement, board, play) {
  const legal = new Set(board.legalCards.map((card) => `${card.rank}-${card.suit}`));
  const ordered = orderHandForDisplay(board.hand, board.trump);
  // The reason of a rejected card goes away with the hand it was about, not on every identical refresh.
  const handKey = ordered.map((card) => `${card.rank}-${card.suit}`).join(",");
  if (handElement.dataset.cards !== handKey) clearHandReasons();
  handElement.dataset.cards = handKey;
  layoutHand(handElement, ordered.length);
  handElement.replaceChildren(...ordered.map((card, index) => {
    const item = cardElement(card);
    const fan = fanFor(index, ordered.length);
    item.style.setProperty("--fan-rot", `${fan.rotation}deg`);
    item.style.setProperty("--fan-y", `${fan.offsetY}px`);
    const isLegal = legal.has(`${card.rank}-${card.suit}`);
    item.classList.toggle("legal-card", isLegal);
    item.tabIndex = isLegal ? 0 : -1;
    const entry = isLegal ? null : board.illegalCards?.find((other) => other.card.rank === card.rank && other.card.suit === card.suit);
    if (entry) {
      // Tapping a card that cannot be played explains why; it never sends a move.
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-disabled", "true");
      const reject = () => rejectCard(handElement, item, entry, board.trump);
      item.addEventListener("click", reject);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          reject();
        }
      });
    }
    if (isLegal) {
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", t("Play {0}", cardName(card)));
      const playIt = () => {
        rememberHandOrigin(item, card);
        play(card);
      };
      item.addEventListener("click", playIt);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          playIt();
        }
      });
    }
    return item;
  }));
}

function cardElement(card) {
  const item = document.createElement("div");
  item.className = `playing-card ${card.suit.toLowerCase()}`;
  item.setAttribute("role", "img");
  item.setAttribute("aria-label", cardName(card));
  item.dataset.rank = card.rank;
  item.dataset.card = `${card.rank}-${card.suit}`;

  const index = document.createElement("span");
  index.className = "card-index";
  const rank = document.createElement("strong");
  rank.textContent = rankLabel(card.rank);
  index.append(rank, suitSymbol(card.suit));
  item.append(index);

  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
    item.classList.add("court-card");
    const face = document.createElement("span");
    face.className = `card-face court-face court-${card.suit.toLowerCase()}`;
    const art = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    art.setAttribute("class", "court-art");
    art.setAttribute("aria-hidden", "true");
    art.setAttribute("viewBox", "0 0 100 130");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `/cards.svg#court-${card.rank}-${card.suit.toLowerCase()}`);
    art.append(use);
    face.append(art);
    item.append(face);
  }
  return item;
}

function orderHandForDisplay(cards, trump) {
  const normalRanks = ["7", "8", "9", "J", "Q", "K", "10", "A"];
  const trumpRanks = ["7", "8", "Q", "K", "10", "A", "9", "J"];
  const naturalSuits = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
  const allTrumps = String(trump).toLowerCase() === "all trumps";
  const noTrumps = String(trump).toLowerCase() === "no trumps";
  const trumpSuit = trump && !allTrumps && !noTrumps ? trump.toUpperCase() : "";
  const suits = trumpSuit
    ? [trumpSuit, ...naturalSuits.filter((suit) => suit !== trumpSuit)]
    : naturalSuits;

  return [...cards].sort((left, right) => {
    const suitDifference = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDifference !== 0) return suitDifference;
    const ranks = allTrumps || left.suit === trumpSuit ? trumpRanks : normalRanks;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}

function renderTrickDiamond(container, cards, seats, activePlayerIndex, currentPlayerIndex, result = null, emptyPrompt = t("Play the opening card")) {
  const previous = trickRenderState.get(container);
  const renderId = (previous?.renderId ?? 0) + 1;
  // Cards already on the table stay still; only cards played since the last render are revealed one by one.
  // A new trick (the previous one was reviewed and collected, or other cards are shown) starts from an empty table.
  // The last trick is played automatically, so it can directly replace the reviewed seventh trick.
  const cardKeys = cards.map((card) => `${card.rank}-${card.suit}`);
  const sameTrick = previous && previous.cardKeys.every((key, index) => cardKeys[index] === key)
    && (!previous.reviewed || Boolean(result));
  const alreadyShown = previous ? (sameTrick ? previous.count : 0) : cards.length;
  const newCards = cards.length - alreadyShown;
  const placements = ["bottom", "left", "top", "right"];
  const winnerIndex = result ? seats.findIndex((seat) => seat.name === result.winner) : -1;
  const winnerPlacement = winnerIndex < 0 ? ""
    : placements[(winnerIndex - currentPlayerIndex + seats.length) % seats.length];
  // A reviewed trick that gives way to the next one is first gathered towards its winner.
  const collected = previous?.reviewed && !sameTrick && previous.winnerPlacement && !motionReduced()
    ? container.querySelector(".trick-diamond") : null;
  const startMs = collected ? trickCollectMs : 0;
  trickRenderState.set(container, { count: cards.length, cardKeys, renderId, reviewed: Boolean(result), winnerPlacement });
  const revealMs = startMs + newCards * trickRevealDelay;
  container.dataset.revealMs = String(revealMs);
  // The cards that fly in from their origin (Full only); the others keep the plain arrival.
  const flights = [];
  const show = (content) => {
    if (!collected) {
      container.replaceChildren(content);
      launchFlights(container, flights);
      return;
    }
    collected.classList.add("trick-collecting", `collect-to-${previous.winnerPlacement}`);
    window.setTimeout(() => {
      if (trickRenderState.get(container)?.renderId !== renderId) return;
      container.replaceChildren(content);
      launchFlights(container, flights);
    }, trickCollectMs);
  };

  if (!cards.length) {
    show(document.createTextNode(emptyPrompt));
    return;
  }

  const diamond = document.createElement("div");
  diamond.className = "trick-diamond";
  const leaderIndex = (activePlayerIndex - cards.length + seats.length) % seats.length;

  cards.forEach((card, playIndex) => {
    const playerIndex = (leaderIndex + playIndex) % seats.length;
    const relativeIndex = (playerIndex - currentPlayerIndex + seats.length) % seats.length;
    const slot = document.createElement("div");
    slot.className = `trick-slot trick-slot-${placements[relativeIndex]}`;
    const player = document.createElement("small");
    player.className = "trick-player";
    player.textContent = playerName(seats[playerIndex].name);
    const playedCard = cardElement(card);
    playedCard.style.setProperty("--rest-angle", `${restAngle(card)}deg`);
    if (playIndex >= alreadyShown) {
      if (effectsLevel() === "full") flights.push({ card: playedCard, key: `${card.rank}-${card.suit}`, placement: placements[relativeIndex] });
      // The cards are put on the table once the previous trick is gathered, so only the sound waits for it.
      const delay = (playIndex - alreadyShown) * trickRevealDelay;
      playedCard.classList.add("card-arriving");
      playedCard.style.setProperty("--reveal-delay", `${delay}ms`);
      player.classList.add("card-arriving");
      player.style.setProperty("--reveal-delay", `${delay}ms`);
      window.setTimeout(() => {
        if (trickRenderState.get(container)?.renderId === renderId) playSound("card");
      }, startMs + delay);
    }
    slot.append(playedCard, player);
    if (result?.winner === seats[playerIndex].name) {
      const announceWinner = () => {
        slot.classList.add("trick-winner");
        // The arrival is over; its animation would outrank the pop, and its end state is the resting one.
        playedCard.classList.remove("card-arriving", "flies");
        playedCard.classList.add("winning-card");
        const points = document.createElement("strong");
        points.className = "trick-points";
        points.textContent = `+${result.points} pts`;
        points.setAttribute("role", "status");
        points.setAttribute("aria-label", t("{0} wins the trick for {1} points", playerName(result.winner), result.points));
        slot.append(points);
      };
      if (newCards > 0) {
        window.setTimeout(() => {
          if (trickRenderState.get(container)?.renderId === renderId) {
            announceWinner();
            playSound("trickWin");
          }
        }, revealMs + 150);
      } else {
        announceWinner();
      }
    }
    diamond.append(slot);
  });
  show(diamond);
}

// Runs `show` once the hand-off cover is gone (`ready`, resolved at once outside pass-and-play) and the last card
// of the trick has landed, matching the delayed round-result reveal; `extra` is added after the reveal.
function afterReveal(trickContainer, ready, extra, show) {
  // Read the delay once `ready` has resolved: the trick is rendered after the call, and sets `revealMs` then.
  ready.then(() => {
    const delay = Number(trickContainer.dataset.revealMs || 0);
    window.setTimeout(show, delay ? delay + extra : 0);
  });
}

// Celebrates the end of a round or match for the viewer's team. With nothing to celebrate it plays the sound the
// result always had.
function celebrateRound(trickContainer, table, round, board, match, ready = Promise.resolve()) {
  afterReveal(trickContainer, ready, 500, () => {
    const myTeam = board.currentPlayerIndex % 2;
    const moments = momentsForRound({ round, board, match, myTeam });
    if (moments) celebrate(table, moments.sticker, moments.chips);
    else playSound(match?.complete ? "roundLose" : roundSound(round, myTeam === 0));
  });
}

// The review of the round that just ended (US-066), opened from the "Review round" buttons of the two result panels.
function openRoundReview(board, round) {
  showRoundReview({ review: round.review, seats: board.seats, currentPlayerIndex: board.currentPlayerIndex });
}

// Small goals and streaks (US-113). `goals` is the ledger of goals.js: a guest's lives in localStorage, a signed-in
// player's comes from their statistics (null while unknown or unreachable: no goal is shown or celebrated then).
let goals = null;
let goalsSignedIn = false;
const goalOutcomes = new Map();

function goalText(ledger) {
  const { key, args } = goalMessage(goalSummary(ledger));
  return t(key, ...args);
}

function renderGoalLine() {
  const line = document.querySelector("#goal-line");
  line.textContent = goals ? goalText(goals) : "";
  line.hidden = !goals;
}

async function loadGoals(signedIn) {
  goalsSignedIn = signedIn;
  if (!signedIn) {
    goals = loadLedger(window.localStorage);
  } else {
    goals = await apiJson("/api/statistics").then(ledgerFromStatistics, () => null);
  }
  renderGoalLine();
}

// What a finished match adds to the goals, once per match: `{ celebration, message }` for the end-of-match screen.
// A guest's result is added to the ledger on the device. A signed-in player's is recorded by the server: it is only
// previewed here, and the statistics are fetched again a moment later. `live` is false when the player comes back
// to a match that ended before: nothing is celebrated then.
function goalOutcome(signature, won, live) {
  if (goalOutcomes.has(signature)) return goalOutcomes.get(signature);
  if (!goals) return null;
  const after = recordResult(goals, signature, won);
  const outcome = {
    celebration: live && !goals.seen.includes(signature) ? goalCelebration(goals, won) : null,
    message: goalText(goalsSignedIn && !live ? goals : after),
  };
  goalOutcomes.set(signature, outcome);
  if (!goalsSignedIn) {
    goals = after;
    saveLedger(window.localStorage, goals);
    renderGoalLine();
  } else if (live) {
    window.setTimeout(() => loadGoals(true), 1500);
  }
  return outcome;
}

// The end-of-match screen (US-093). `matchEndDismissed` holds the games whose screen the player put away with
// "View table" or Escape; `matchEndShown` is the game whose screen is open, so a re-render of a finished match does
// not rebuild it; `matchEndLast` keeps what "Results" needs to open it again.
const matchEndDismissed = new Set();
let accountOffer = loadOffer(window.localStorage);
const matchEndLast = new Map();
let matchEndShown = "";
// Bumped whenever the screen is closed or reset, so an opening still waiting for the last trick is dropped.
let matchEndGeneration = 0;

function openMatchEnd(gameKey, model, animate, playAgain) {
  hideRoundReview();
  matchEndShown = gameKey;
  matchEndLast.set(gameKey, { model, playAgain });
  showMatchEnd(model, {
    animate,
    playAgain,
    onDismissOffer: () => {
      model.offer = false;
      accountOffer = dismissOffer(accountOffer);
      saveOffer(window.localStorage, accountOffer);
    },
    onCreateAccount: () => {
      model.offer = false;
      closeMatchEnd();
      navigate("/");
      openSignInPanel(document.querySelector("#account-bar"));
      showSignUpWarning(true);
    },
    onDismiss: () => {
      matchEndDismissed.add(gameKey);
      matchEndShown = "";
    },
  });
}

function closeMatchEnd() {
  matchEndShown = "";
  matchEndGeneration += 1;
  hideMatchEnd();
  // Leaving a table, or a new round or match starting, also ends a review of the round before.
  hideRoundReview();
}

// Opens the end-of-match screen once the last card has landed and the sticker of the winner has played; a viewer
// on the losing team has no sticker, so it opens sooner. Coming back to a finished match (no reveal) opens it at
// once and without confetti. Does nothing for a game whose screen is open or was put away.
function celebrateMatchEnd(trickContainer, gameKey, board, match, ready, playAgain) {
  const model = matchEndModel({ match, seats: board.seats, myTeam: board.currentPlayerIndex % 2 });
  if (!model) return;
  model.solo = gameKey.startsWith("bot:");
  model.rematch = rematchView(match, board.seats, board.currentPlayerIndex);
  // The table changed while the screen is open or put away: a rematch was proposed or accepted (US-114).
  const last = matchEndLast.get(gameKey);
  if (last) last.model.rematch = model.rematch;
  if (matchEndShown === gameKey) {
    showRematch(model.rematch);
    return;
  }
  if (matchEndDismissed.has(gameKey)) return;
  const generation = matchEndGeneration;
  afterReveal(trickContainer, ready, model.iWon ? 2400 : 1000, () => {
    if (generation !== matchEndGeneration || matchEndShown === gameKey || matchEndDismissed.has(gameKey)) return;
    const live = Number(trickContainer.dataset.revealMs || 0) > 0;
    model.goal = goalOutcome(`${gameKey}:${match.northSouth}-${match.eastWest}`, model.iWon, live);
    // A guest who has just finished a match is offered an account now and then (US-115), never on coming back to it.
    if (live && !visitorSignedIn) {
      accountOffer = countMatch(accountOffer, `${gameKey}:${match.northSouth}-${match.eastWest}`);
      saveOffer(window.localStorage, accountOffer);
      model.offer = shouldOffer(accountOffer, visitorSignedIn);
    }
    openMatchEnd(gameKey, model, live, playAgain);
  });
}

// A match that is not finished (a rematch began, here or at another seat) has no end-of-match screen.
function resetMatchEnd(gameKey) {
  matchEndDismissed.delete(gameKey);
  matchEndLast.delete(gameKey);
  closeMatchEnd();
}

// "Results": brings the screen back after "View table".
function reopenMatchEnd(gameKey) {
  const last = matchEndLast.get(gameKey);
  if (!last) return;
  matchEndDismissed.delete(gameKey);
  openMatchEnd(gameKey, last.model, false, last.playAgain);
}

// One watcher per game follows its declaration messages, so a belote is celebrated once, a reload mid-round not at
// all, and in pass-and-play on the turn of the declaring team.
const beloteWatchers = new Map();

function celebrateBelote(table, gameKey, board, ready = Promise.resolve()) {
  if (!beloteWatchers.has(gameKey)) beloteWatchers.set(gameKey, createBeloteWatcher());
  const kind = beloteWatchers.get(gameKey).watch({
    message: board.declarationMessage || "",
    seats: board.seats,
    myTeam: board.currentPlayerIndex % 2,
  });
  const trick = table.querySelector(".current-trick");
  if (kind && trick) afterReveal(trick, ready, 0, () => celebrate(table, kind));
}

function roundSound(round, humanInNorthSouth) {
  const ours = humanInNorthSouth ? round.northSouthAwarded : round.eastWestAwarded;
  const theirs = humanInNorthSouth ? round.eastWestAwarded : round.northSouthAwarded;
  return ours >= theirs ? "roundWin" : "roundLose";
}

// Fades a control in once the trick reveal has finished, so it never appears before the last card lands.
function revealAfterTrick(button, container, visible) {
  button.hidden = !visible;
  button.classList.remove("arriving-late");
  if (!visible) return;
  const delay = Number(container.dataset.revealMs || 0);
  button.style.setProperty("--reveal-delay", `${delay + (delay ? 500 : 0)}ms`);
  void button.offsetWidth;
  button.classList.add("arriving-late");
}

// The contract currently drawn on each table ("private", "bot", "bidding"), advanced call by call during an auction.
const shownContract = {};
// Identity of the contract last drawn on any table; the badge bounces when it changes.
// null until the first draw: a page loaded mid-game shows the standing contract without a bounce.
let lastBadgeKey = null;

// The badge text for a contract, e.g. "80 Hearts" or just the suit when trump was chosen without a bid.
function contractLabel(contract) {
  const suit = suitName(contract.suit, false);
  return contract.value == null ? suit : `${contract.value} ${suit}`;
}

// Puts the contract badge on the bidder's seat and takes it off every other seat of the table.
// The badge bounces only when the contract changed since the last time it was shown.
function showContractBadge(prefix, contract, keepKey = false) {
  // Language-independent, and shared by every table: the auction and the board it ends in show the same contract.
  const key = contract
    ? [contract.player, contract.value, suitKey(contract.suit), contract.coinched].join("|")
    : "";
  const changed = !keepKey && lastBadgeKey !== null && key !== lastBadgeKey;
  if (!keepKey) lastBadgeKey = key;
  for (const station of document.querySelectorAll(`[id^="${prefix}-player-"]`)) {
    const mine = contract && station.dataset.playerName === contract.player;
    // The badge is aria-hidden: the holder's seat label carries the contract instead.
    if (station.dataset.seatLabel !== undefined) {
      station.setAttribute("aria-label", station.dataset.seatLabel
        + (mine ? t(", contract {0}", contractLabel(contract)) + (contract.coinched ? t(", coinched") : "") : ""));
    }
    let badge = station.querySelector(".contract-badge");
    if (!mine) {
      badge?.remove();
      continue;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "contract-badge";
      badge.setAttribute("aria-hidden", "true");
      const details = station.querySelector(".player-details");
      if (details) details.after(badge);
      else station.append(badge);
    }
    const suits = setSuitText(badge, contractLabel(contract), { symbolOnly: true });
    badge.dataset.red = suits.some((suit) => suit === "hearts" || suit === "diamonds");
    if (contract.coinched) {
      const mark = document.createElement("span");
      mark.className = "contract-mark";
      mark.textContent = "×2";
      badge.append(mark);
    }
    badge.classList.remove("badge-bounce");
    if (changed) {
      void badge.offsetWidth;
      badge.classList.add("badge-bounce");
    }
  }
}

// A bot's seat avatar: its character from avatars.svg with a face drawn on top (the face starts neutral).
function botAvatar(character) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "player-avatar bot-avatar");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.character = character.key;
  svg.dataset.expression = "neutral";
  const body = document.createElementNS("http://www.w3.org/2000/svg", "use");
  body.setAttribute("href", `/avatars.svg#avatar-${character.key}`);
  const face = document.createElementNS("http://www.w3.org/2000/svg", "use");
  face.setAttribute("href", "/avatars.svg#face-neutral");
  svg.append(body, face);
  return svg;
}

function setBotExpression(prefix, seatIndex, expression) {
  const station = ["bottom", "left", "top", "right"]
    .map((placement) => document.querySelector(`#${prefix}-player-${placement}`))
    .find((item) => item?.dataset.seatIndex === String(seatIndex));
  const avatar = station?.querySelector(".bot-avatar");
  if (!avatar || avatar.dataset.expression === expression) return;
  avatar.dataset.expression = expression;
  avatar.querySelectorAll("use")[1]?.setAttribute("href", `/avatars.svg#face-${expression}`);
  avatar.classList.remove("expression-change");
  if (effectsLevel() !== "off") {
    void avatar.getBoundingClientRect().width;
    avatar.classList.add("expression-change");
  }
}

// At most one result line per round (a match end always speaks), plus one big-trick line that does not use
// up the result's turn: both flags are cleared when a round or match ends (see commentFor in bot-lines.js).
const botCommentState = { shown: false, trickShown: false, count: 0, line: null, timer: null };

function botCommentsEnabled() {
  try {
    return window.localStorage.getItem("beelot.bot-comments") !== "false";
  } catch (_) {
    return true;
  }
}

function clearBotLine() {
  window.clearTimeout(botCommentState.timer);
  botCommentState.line?.remove();
  botCommentState.line = null;
  botCommentState.timer = null;
}

function resetBotComments() {
  clearBotLine();
  botCommentState.shown = false;
  botCommentState.trickShown = false;
}

// The games whose greeting this tab has already handled, so a reload at the very start does not greet twice.
// Storage can be missing or blocked: then the greeting simply happens once per page load.
function markGreeted(game) {
  try {
    const greeted = JSON.parse(window.sessionStorage.getItem("beelot.greeted") ?? "[]");
    if (greeted.includes(game)) return false;
    window.sessionStorage.setItem("beelot.greeted", JSON.stringify([...greeted.slice(-19), game]));
  } catch (_) {
    return true;
  }
  return true;
}

// Shows `text` (an English key) in a bubble beside the seat's avatar for 3 seconds; one bubble at a time.
// The bubble lives in the table, not in the seat, because renderTableSeats rebuilds the seats.
function showBotLine(prefix, seatIndex, text) {
  const station = ["bottom", "left", "top", "right"]
    .map((placement) => document.querySelector(`#${prefix}-player-${placement}`))
    .find((item) => item?.dataset.seatIndex === String(seatIndex));
  if (!station?.parentElement) return;
  clearBotLine();
  const bubble = document.createElement("p");
  bubble.className = `bot-line bot-line-${station.id.split("-").at(-1)}`;
  bubble.setAttribute("aria-hidden", "true");
  bubble.textContent = t(text);
  station.parentElement.append(bubble);
  botCommentState.line = bubble;
  botCommentState.timer = window.setTimeout(clearBotLine, 3000);
}

function commentOnEvents(prefix, events, seats) {
  const isBotName = (name) => botCharacter(name) !== null;
  const board = { seats };
  const enabled = botCommentsEnabled();
  const greeting = events.find((event) => event.type === "greeting");
  if (greeting && markGreeted(scoreBarGame) && enabled) {
    const greeter = greetingFor(greeting, board, isBotName, botCharacter, botCommentState.count++);
    if (greeter) showBotLine(prefix, greeter.seat, greeter.text);
  }
  const rest = events.filter((event) => event !== greeting);
  if (!rest.length) return;
  if (enabled) {
    const picked = commentFor(botCommentState, rest, board, isBotName, botCharacter, botCommentState.count++);
    if (picked) showBotLine(prefix, picked.seat, picked.text);
  } else if (rest.some((event) => event.type === "round" || event.type === "match")) {
    botCommentState.shown = false;
    botCommentState.trickShown = false;
  }
}

// `contract` undefined redraws the seats with the contract already shown (a lobby refresh must not wipe the badge).
function renderTableSeats(prefix, seats, currentPlayerIndex = 0, contractArg = undefined) {
  const contract = contractArg === undefined ? shownContract[prefix] ?? null : contractArg;
  const placements = ["bottom", "left", "top", "right"];
  placements.forEach((placement, offset) => {
    let refocusChip = null;
    const seatIndex = (currentPlayerIndex + offset) % seats.length;
    const seat = seats[seatIndex];
    const station = document.querySelector(`#${prefix}-player-${placement}`);
    if (!station || !seat) return;
    station.classList.toggle("active-player", seat.active);
    station.dataset.playerName = seat.name;
    station.dataset.seatIndex = seatIndex;
    // The contract is appended by showContractBadge, which keeps the label in step with the badge.
    station.dataset.seatLabel = t("{0}, {1}, {2}{3}", playerName(seat.name), t(seat.team), t(`${seat.cardCount} cards`), seat.active ? t(", active player") : "");

    const character = botCharacter(seat.name);
    let avatar;
    if (character) {
      avatar = botAvatar(character);
    } else {
      avatar = document.createElement("span");
      avatar.className = "player-avatar";
      avatar.textContent = playerName(seat.name).trim().slice(0, 1).toUpperCase();
    }
    const details = document.createElement("span");
    details.className = "player-details";
    const name = document.createElement("strong");
    // The solo player's seat is already called "You"; other players at the device get the marker after their name.
    name.textContent = offset === 0 && seat.name !== "You" ? t("{0} · You", playerName(seat.name)) : playerName(seat.name);
    const meta = document.createElement("small");
    meta.className = "seat-meta";
    meta.dataset.team = seat.team;
    meta.textContent = `${t(seat.team)} · ${t(`${seat.cardCount} cards`)}`;
    details.append(name, meta);

    const contents = [avatar, details];
    // The seat is rebuilt below: a focused dealer chip must not lose focus (and its tooltip) on every redraw.
    const chipHadFocus = document.activeElement?.classList.contains("dealer-chip") && station.contains(document.activeElement);
    if (seat.dealer) {
      const chip = document.createElement("span");
      chip.className = "dealer-chip";
      chip.setAttribute("role", "img");
      chip.tabIndex = 0;
      chip.setAttribute("aria-label", t("Dealer"));
      chip.dataset.label = t("Dealer");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "/icons.svg#icon-dealer");
      icon.append(use);
      chip.append(icon);
      contents.push(chip);
      if (chipHadFocus) refocusChip = chip;
    }
    if (seat.call) {
      const call = document.createElement("span");
      call.className = "player-call";
      const text = callText(seat.call);
      const suits = setSuitText(call, text, { symbolOnly: true });
      call.dataset.call = text;
      call.dataset.kind = callKind(seat.call);
      call.dataset.red = suits.some((suit) => suit === "hearts" || suit === "diamonds");
      contents.push(call);
    }
    if (offset !== 0) {
      const hiddenHand = document.createElement("span");
      hiddenHand.className = "hidden-hand";
      hiddenHand.setAttribute("aria-hidden", "true");
      fillHiddenHand(hiddenHand, seat.cardCount);
      contents.push(hiddenHand);
    }
    station.replaceChildren(...contents);
    if (refocusChip) refocusChip.focus({ preventScroll: true });
  });
  shownContract[prefix] = contract;
  showContractBadge(prefix, contract, contractArg === undefined);
  moveDealerChip(prefix, seats.find((seat) => seat.dealer)?.name);
  botExpressionState.setSeats(prefix, seats);
}

// The dealer last drawn, with the game it belongs to; null until the first draw of the page.
// The chip animates only when the dealer changes within the same game.
let lastDealer = null;

// Moves the new dealer's chip from the previous dealer's seat when the deal passes (US-097).
function moveDealerChip(prefix, dealerName) {
  if (dealerName === undefined) return;
  const game = currentRouteId();
  const previous = lastDealer;
  lastDealer = { game, name: dealerName };
  if (!previous || previous.game !== game || previous.name === dealerName) return;
  const level = effectsLevel();
  if (level === "off") return;
  const chip = seatStation(prefix, dealerName)?.querySelector(".dealer-chip");
  if (!chip) return;
  if (level === "reduced") {
    chip.animate({ opacity: [0, 1] }, { duration: cssDurationMs("--effect-fast", 150), easing: "ease-out" });
    return;
  }
  const from = seatStation(prefix, previous.name)?.getBoundingClientRect();
  const to = chip.parentElement.getBoundingClientRect();
  if (!from || !from.width || !to.width) return;
  const dx = from.right - to.right;
  const dy = from.top - to.top;
  // Keep the seat (and so the chip) above the other seats while it slides.
  const station = chip.parentElement;
  station.classList.add("dealer-moving");
  const slide = chip.animate(
    { transform: [`translate(${dx}px, ${dy}px)`, "translate(0, 0)"] },
    { duration: 600, easing: "ease-out" });
  slide.addEventListener("finish", () => station.classList.remove("dealer-moving"));
  slide.addEventListener("cancel", () => station.classList.remove("dealer-moving"));
}

// A CSS custom property holding a duration ("150ms", "0.15s" or "0s"), in milliseconds.
function cssDurationMs(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  const number = parseFloat(value);
  if (Number.isNaN(number)) return fallback;
  return value.endsWith("ms") ? number : value.endsWith("s") ? number * 1000 : number;
}

function fillHiddenHand(hiddenHand, count) {
  hiddenHand.replaceChildren(...Array.from({ length: count }, (_, card) => {
    const back = document.createElement("i");
    back.className = "card-back";
    back.style.setProperty("--card-index", card);
    back.style.setProperty("--card-total", count);
    return back;
  }));
}

function setSeatCardCount(station, count) {
  const hiddenHand = station.querySelector(".hidden-hand");
  if (hiddenHand) fillHiddenHand(hiddenHand, count);
  const meta = station.querySelector(".seat-meta");
  if (meta) meta.textContent = `${t(meta.dataset.team)} · ${t(`${count} cards`)}`;
}

// "full", "reduced" or "off", as applied to the page by applySettings().
function effectsLevel() {
  return document.body.dataset.effects || "full";
}

function motionReduced() {
  return effectsLevel() !== "full";
}

function seatStation(prefix, seatName) {
  return [...document.querySelectorAll(`[id^="${prefix}-player-"]`)]
    .find((station) => station.dataset.playerName === seatName);
}

// Flies a packet of card backs across the table and resolves when it lands.
function flyPacket(table, from, to, size) {
  playSound("deal");
  const tableRect = table.getBoundingClientRect();
  const center = (element) => {
    const rect = element.getBoundingClientRect();
    return [rect.left + rect.width / 2 - tableRect.left, rect.top + rect.height / 2 - tableRect.top];
  };
  const [startX, startY] = center(from);
  const [endX, endY] = center(to);
  const packet = document.createElement("span");
  packet.className = "deal-packet";
  packet.setAttribute("aria-hidden", "true");
  for (let card = 0; card < size; card += 1) {
    const back = document.createElement("i");
    back.className = "card-back";
    back.style.setProperty("--card-index", card);
    packet.append(back);
  }
  table.append(packet);
  const place = (x, y, scale) => `translate(${x - 24}px, ${y - 34}px) scale(${scale})`;
  const flight = packet.animate([
    { transform: place(startX, startY, .7), opacity: 1 },
    { transform: place(endX, endY, .55), opacity: 1, offset: .85 },
    { transform: place(endX, endY, .4), opacity: 0 }
  ], { duration: dealFlightMs, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  return flight.finished.then(() => packet.remove(), () => packet.remove());
}

/**
 * Animates cards being dealt. Each step deals `sizes[seatIndex]` cards to every seat, starting with the seat
 * to the dealer's left. A step may come from the table centre (the upturned card) instead of the dealer.
 */
async function dealCards({ prefix, seatNames, dealerIndex, steps, handElement, startCount }) {
  const table = document.querySelector(`#${prefix}-card-table`);
  const counts = seatNames.map(() => startCount);
  const center = document.querySelector(`#${prefix}-card-table .table-center`);
  handElement.classList.add("dealing");
  for (const step of steps) {
    for (let offset = 1; offset <= seatNames.length; offset += 1) {
      const seatIndex = (dealerIndex + offset) % seatNames.length;
      const size = step.sizes[seatIndex];
      if (!size) continue;
      const target = seatStation(prefix, seatNames[seatIndex]);
      const source = step.fromCenter ? center : seatStation(prefix, seatNames[dealerIndex]);
      if (!target || !source) continue;
      const isHuman = target.id.endsWith("-bottom");
      await flyPacket(table, source, isHuman ? handElement : target, size);
      counts[seatIndex] += size;
      if (isHuman) {
        handElement.querySelectorAll(".undealt").forEach((card, index) => {
          if (index >= size) return;
          card.classList.remove("undealt");
          card.classList.add("dealt-in");
        });
      }
      setSeatCardCount(target, counts[seatIndex]);
      await pause(dealGapMs);
    }
  }
  handElement.classList.remove("dealing");
}

function pause(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function callLabel(action, body = {}) {
  if (action === "pass") return t("Pass");
  if (action === "coinche") return t("Coinche!");
  if (action === "contract") return `${body.value} ${suitName(body.suit)}`;
  if (action === "trump") return suitName(body.suit);
  return "";
}

// The translated text of a call; bubbles show its suit names as symbols (see setSuitText).
function callText(call) {
  return t(call);
}

function callKind(call) {
  if (/^pass/i.test(call)) return "pass";
  if (/^coinche/i.test(call)) return "coinche";
  return /^\d/.test(call) ? "bid" : "trump";
}

function callStation(prefix, player, playerIsId) {
  return [...document.querySelectorAll(`[id^="${prefix}-player-"]`)].find((item) => playerIsId
    ? item.id.endsWith("-bottom")
    : item.dataset.playerName === player);
}

function showPlayerCall(prefix, player, call, playerIsId = false) {
  const station = callStation(prefix, player, playerIsId);
  if (!station || !call) return false;
  const text = callText(call);
  const existing = station.querySelector(".player-call:not(.player-thinking)");
  if (existing?.dataset.call === text) return false;
  existing?.remove();
  // Earlier calls fade back so the newest one is always the focus.
  document.querySelectorAll(`[id^="${prefix}-player-"] .player-call`).forEach((old) => old.classList.add("stale"));
  const kind = callKind(call);
  const bubble = document.createElement("span");
  bubble.className = "player-call call-arriving";
  bubble.dataset.kind = kind;
  const suits = setSuitText(bubble, text, { symbolOnly: true });
  bubble.dataset.call = text;
  bubble.dataset.red = suits.some((suit) => suit === "hearts" || suit === "diamonds");
  station.append(bubble);
  // The viewer's own call arrives translated ("Passer"), so a pass is recognised by its kind, not by its text.
  if (kind !== "pass") {
    shownContract[prefix] = contractAfterCall(shownContract[prefix] ?? null, station.dataset.playerName, call);
    showContractBadge(prefix, shownContract[prefix]);
  }
  station.dataset.callKind = kind;
  station.classList.remove("call-flash");
  void station.offsetWidth;
  station.classList.add("call-flash");
  playCallSound(call);
  return true;
}

// Spotlights a player while they "think", so it is clear whose decision is about to appear.
function showThinking(station) {
  const bubble = document.createElement("span");
  bubble.className = "player-call player-thinking";
  bubble.setAttribute("aria-hidden", "true");
  bubble.append(...[0, 1, 2].map((dot) => {
    const item = document.createElement("i");
    item.style.setProperty("--dot", dot);
    return item;
  }));
  station.classList.add("deciding");
  station.append(bubble);
  return () => {
    station.classList.remove("deciding");
    bubble.remove();
  };
}

// Narrates a call in the table message, e.g. "Luc passes." or "Camille bids 80 Clubs."
function callNarration(name, call) {
  const kind = callKind(call);
  if (kind === "pass") return t("{0} passes.", playerName(name));
  if (kind === "coinche") return t(`${name} coinches the contract.`);
  if (kind === "bid") return t(`${name} bids ${call}.`);
  return t("{0} takes with {1}.", playerName(name), suitName(call, false));
}

async function announceCall(prefix, player, call) {
  const station = callStation(prefix, player, false);
  if (!station || !call) return;
  const already = station.querySelector(".player-call:not(.player-thinking)")?.dataset.call === callText(call);
  if (already) return;
  const message = document.querySelector(prefix === "private" ? "#private-game-message" : `#${prefix}-message`);
  if (message) message.textContent = t(`${player} is deciding.`);
  const stopThinking = showThinking(station);
  await pause(biddingThinkDelay);
  stopThinking();
  if (showPlayerCall(prefix, player, call)) {
    if (message) setSuitText(message, callNarration(player, call));
    await pause(biddingRevealDelay);
  }
}

async function revealCalls(prefix, calls, excludedPlayer = "") {
  for (const call of calls ?? []) {
    if (!call.call || call.playerName === excludedPlayer) continue;
    await announceCall(prefix, call.playerName, call.call);
  }
}

// Deals the opening cards, then shows the bids made by the players who speak before the human.
async function playOpeningDeal(game, bidding, humanIndex) {
  const controls = [...document.querySelectorAll(".auction-dock button")];
  const wasDisabled = controls.map((button) => button.disabled);
  controls.forEach((button) => { button.disabled = true; });
  const seatNames = game.seats.map((seat) => seat.name);
  const handSize = bidding.hand.length;
  const steps = firstDealSteps[bidding.variant].map((size) => ({ sizes: seatNames.map(() => size) }));
  await dealCards({
    prefix: "bidding", seatNames, dealerIndex: bidding.dealerIndex, steps, startCount: 0,
    handElement: document.querySelector("#bidding-hand")
  });
  const upturned = document.querySelector("#upturned-card");
  if (bidding.upturnedCard) {
    upturned.hidden = false;
    upturned.classList.add("call-arriving");
    await pause(ownCallDelay);
  }
  const bidOrder = (name) => (seatNames.indexOf(name) - bidding.dealerIndex - 1 + seatNames.length) % seatNames.length;
  const earlyCalls = bidding.calls.filter((call) => call.call && call.playerName !== seatNames[humanIndex])
    .sort((left, right) => bidOrder(left.playerName) - bidOrder(right.playerName));
  for (const call of earlyCalls) {
    await announceCall("bidding", call.playerName, call.call);
  }
  controls.forEach((button, index) => { button.disabled = wasDisabled[index]; });
}

async function loadBidding(gameId) {
  try {
    const snapshot = await api.table(gameId);
    const game = localGame(snapshot);
    const { bidding } = snapshot;
    leaveState = { kind: "solo", matchComplete: false };
    showTableStatus({ phase: "bidding", complete: bidding.complete, myTurn: bidding.playerTurn,
      activeName: bidding.activePlayer, passAndPlay: game.passAndPlay });
    const isContree = bidding.variant === "CONTREE";
    document.querySelector("#bidding-eyebrow").textContent = t(isContree ? "Contrée auction" : "Choose trump");
    document.querySelector("#bidding-variant").textContent = t("{0} · {1} bots", t(game.variantLabel), t(game.difficultyLabel));
    document.querySelector("#bidding-hand-label").textContent = t(isContree ? "Your eight-card hand" : "Your five-card hand");
    document.querySelector("#bidding-hand").setAttribute("aria-label", t(isContree ? "Your eight cards" : "Your five cards"));
    const currentPlayerIndex = bidding.currentPlayerIndex;
    const humanName = game.seats[currentPlayerIndex]?.name;
    const handedOff = handOff(game, humanName);
    const dealKey = `${gameId}:${bidding.dealerIndex}`;
    const animateDeal = dealKey !== lastDealKey && !motionReduced()
      && !bidding.calls.some((call) => call.playerName === humanName && call.call);
    lastDealKey = dealKey;
    pendingSecondDeal = isContree ? null : { gameId, hand: bidding.hand, viewer: humanName };
    const upturned = document.querySelector("#upturned-card");
    upturned.hidden = isContree || animateDeal;
    if (!isContree) upturned.replaceChildren(cardElement(bidding.upturnedCard));
    const handElement = document.querySelector("#bidding-hand");
    handElement.replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));
    layoutHand(handElement, bidding.hand.length);
    if (animateDeal) handElement.childNodes.forEach((card) => card.classList.add("undealt"));
    const seats = game.seats.map((seat, index) => ({
      name: seat.name,
      cardCount: animateDeal ? 0 : bidding.hand.length,
      active: seat.name === bidding.activePlayer,
      dealer: index === bidding.dealerIndex,
      team: index % 2 === 0 ? "North–South" : "East–West",
      call: animateDeal ? "" : bidding.calls.find((call) => call.playerName === seat.name)?.call ?? ""
    }));
    renderTableSeats("bidding", seats, currentPlayerIndex < 0 ? 0 : currentPlayerIndex,
    // The opening reveal builds the badge call by call through showPlayerCall.
    animateDeal ? null : contractFromAuction(bidding.auction));
    botExpressionState.updateBidding("bidding", seats, bidding);
    const isSecondRound = bidding.round === 2;
    const accept = document.querySelector("#accept-upturned-button");
    accept.hidden = isContree || isSecondRound;
    // The button names the suit it takes ("Take ♥ Hearts"), so the choice is clear without reading the card.
    if (!accept.hidden && bidding.upturnedCard) setSuitText(accept, t("Take {0}", suitName(bidding.upturnedCard.suit)));
    document.querySelector("#bid-help").textContent = t(passHelp({ variant: bidding.variant, round: bidding.round }));
    document.querySelector("#trump-options").hidden = isContree || !isSecondRound;
    document.querySelector("#contree-options").hidden = !isContree;
    offerAllTrumpChoices("contract-suit", isContree && game.allTrumps);
    updateAmountChoices("contract-value", bidding.highestBid);
    document.querySelector("#contract-bid-button").disabled = bidding.highestBid >= 160 || !bidding.playerTurn;
    document.querySelector("#pass-bid-button").disabled = !bidding.playerTurn;
    offerHint("#table-hint-button", gameId, snapshot.table.hints && bidding.playerTurn && !bidding.complete);
    document.querySelector("#coinche-button").hidden = !bidding.coincheAllowed;
    document.querySelectorAll("#trump-options button").forEach((button) => {
      button.disabled = !bidding.upturnedCard || button.dataset.suit === bidding.upturnedCard.suit;
    });
    // In pass and play, "You" waits for the hand-off, so the bar does not tell who holds the device next.
    if (window.location.pathname === `/play/bot/bidding/${gameId}`) {
      showScoreBar(snapshot.match, null, game.passAndPlay ? null : currentPlayerIndex % 2);
    }
    await handedOff;
    if (window.location.pathname === `/play/bot/bidding/${gameId}`) showScoreBar(snapshot.match, null, currentPlayerIndex % 2);
    if (animateDeal) await playOpeningDeal(game, bidding, currentPlayerIndex);
    // A bot took the contract before the player's first call: show its call, then move to the card table.
    if (bidding.complete) {
      await pause(ownCallDelay);
      if (window.location.pathname !== `/play/bot/bidding/${gameId}`) return;
      navigate(`/play/bot/game/${gameId}`);
    }
  } catch (error) {
    navigate("/play/bot", { replace: true });
  }
}

async function submitBid(action, body) {
  clearHint();
  const gameId = currentRouteId();
  const biddingView = document.querySelector("#bidding-card-table").closest("[data-view]");
  biddingView.classList.add("auction-waiting-view");
  try {
    const humanName = document.querySelector("#bidding-player-bottom").dataset.playerName;
    showPlayerCall("bidding", humanName, callLabel(action, body));
    await pause(ownCallDelay);
    const response = (await api.act(gameId, { type: action, ...body })).bidding;
    // Taking a trump or coinching ends the auction: the card table follows at once.
    // The server lists the calls by seat; the badge must follow them in speaking order, starting after the dealer.
    const speakingOrder = (response.calls ?? []).map((call, seat) => ({ call, seat }))
      .sort((left, right) => ((left.seat - response.dealerIndex + 3) % 4) - ((right.seat - response.dealerIndex + 3) % 4))
      .map(({ call }) => call);
    if (action !== "trump" && action !== "coinche") await revealCalls("bidding", speakingOrder, humanName);
    if (action === "trump" || action === "coinche" || response.complete) {
      navigate(`/play/bot/game/${gameId}`);
      return;
    }
    loadBidding(gameId);
  } catch (error) {
    // A refused call must not stay on the table: redraw the auction as the server holds it, badge included.
    // Only a server refusal leaves the table intact; on a network failure stay put and show the error.
    if (error.status) await loadBidding(gameId);
    setTableStatus(error.message);
  } finally {
    biddingView.classList.remove("auction-waiting-view");
  }
}

// "Play now" and "Quick game" start a bot game with no setup: the choices last made in the setup form, or these defaults.
const DEFAULT_BOT_GAME = { kind: "LOCAL", difficulty: "RELAXED", variant: "CLASSIC", announcements: true, allTrumps: true, target: 1000 };
const BOT_SETTINGS_KEY = "beelot.bot-game";

function savedBotGame() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BOT_SETTINGS_KEY));
    const valid = saved
      && ["RELAXED", "CHALLENGING"].includes(saved.difficulty)
      && ["CLASSIC", "CONTREE"].includes(saved.variant)
      && typeof saved.announcements === "boolean"
      && typeof saved.allTrumps === "boolean"
      && [500, 1000, 1500, 2000].includes(saved.target);
    return valid ? { ...DEFAULT_BOT_GAME, ...saved } : DEFAULT_BOT_GAME;
  } catch {
    return DEFAULT_BOT_GAME;
  }
}

function rememberBotGame(settings) {
  try {
    window.localStorage.setItem(BOT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be blocked: the next quick game then simply uses the defaults.
  }
}

function showBotGameInForm(settings) {
  setChoice("difficulty", settings.difficulty);
  setChoice("variant", settings.variant);
  setChoice("announcements", settings.announcements ? "on" : "off");
  setChoice("all-trumps", settings.allTrumps ? "on" : "off");
  setChoice("target", settings.target);
}

async function startBotGame(settings) {
  const game = await api.createTable(settings);
  navigate(`/play/bot/bidding/${game.tableId}`);
}

// The setup form shows one group of questions at a time (US-105); "Next" is its submit button, so Enter never deals early.
let setupStep = 1;
function showSetupStep(step) {
  setupStep = step;
  const last = step === SETUP_STEPS;
  document.querySelector("#bot-game-form").dataset.step = String(step);
  document.querySelector("#setup-progress").textContent = t("Step {0} of {1}", step, SETUP_STEPS);
  document.querySelector("#setup-back").hidden = step === 1;
  document.querySelector("#setup-next").replaceChildren(t(last ? "Deal the cards" : "Next"), " ", Object.assign(document.createElement("span"), { textContent: "→", ariaHidden: "true" }));
}
document.querySelector("#setup-back").addEventListener("click", () => showSetupStep(moveSetupStep(setupStep, -1)));

document.querySelector("#bot-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (setupStep < SETUP_STEPS) {
    showSetupStep(moveSetupStep(setupStep, 1));
    return;
  }
  const form = new FormData(event.currentTarget);
  const settings = {
    kind: "LOCAL",
    difficulty: form.get("difficulty"),
    variant: form.get("variant"),
    announcements: form.get("announcements") !== "off",
    allTrumps: form.get("all-trumps") !== "off",
    target: Number(form.get("target"))
  };
  rememberBotGame(settings);
  await startBotGame(settings);
});

["#play-now", "#quick-game"].forEach((selector) => document.querySelector(selector).addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const message = document.querySelector("#play-now-message");
  message.textContent = "";
  button.disabled = true;
  try {
    await startBotGame(savedBotGame());
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}));

document.querySelector("#pass-and-play-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.querySelector("#local-form-message");
  message.textContent = "";
  try {
    const game = await api.createTable({
      kind: "LOCAL",
      difficulty: form.get("local-difficulty"),
      variant: form.get("local-variant"),
      announcements: form.get("local-announcements") !== "off",
      allTrumps: form.get("local-all-trumps") !== "off",
      target: Number(form.get("local-target")),
      seats: ["north", "east", "south", "west"].map((seat) => form.get(seat).trim() || null)
    });
    navigate(`/play/bot/bidding/${game.tableId}`);
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#pass-bid-button").addEventListener("click", () => submitBid("pass"));
document.querySelector("#contract-bid-button").addEventListener("click", () => submitBid("contract", {
  value: Number(choiceValue("contract-value")),
  suit: choiceValue("contract-suit")
}));
document.querySelector("#coinche-button").addEventListener("click", () => submitBid("coinche"));
document.querySelector("#accept-upturned-button").addEventListener("click", () => {
  const suit = document.querySelector("#upturned-card .playing-card").classList[1].toUpperCase();
  submitBid("trump", { suit });
});
document.querySelectorAll("#trump-options button").forEach((button) => {
  button.addEventListener("click", () => submitBid("trump", { suit: button.dataset.suit }));
});

document.querySelector("#create-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const access = await api.createTable({
      kind: "PRIVATE",
      playerName: new FormData(event.currentTarget).get("playerName"),
      variant: choiceValue("private-variant")
    });
    enterPrivateTable(access);
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#join-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    enterPrivateTable(await api.join(form.get("invitationCode"), form.get("playerName")));
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#quick-match-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    // A seat still held from an earlier visit would never be played; give it up before taking a new one.
    const previous = getPrivateSession();
    if (previous) {
      await api.act(previous.tableId, { type: "leave" }).catch(() => {});
      forgetTableSession(previous.tableId);
      window.sessionStorage.removeItem(privateSessionKey);
    }
    const access = await api.quickMatch(choiceValue("public-variant"), new FormData(form).get("playerName"));
    document.querySelector("#public-form-message").textContent = "";
    enterPrivateTable(access, "/online/public");
  } catch (error) {
    document.querySelector("#public-form-message").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#leave-table-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    await api.act(tableId, { type: "leave" });
    closeTableStream();
    forgetTableSession(tableId);
    window.sessionStorage.removeItem(privateSessionKey);
    navigate("/online/public");
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#ready-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  const seat = document.querySelectorAll("#private-seat-list .seat");
  if (!session || session.tableId !== tableId || !seat) return;
  const currentReady = document.querySelector("#ready-button").textContent === t("Not ready");
  try {
    showPrivateTable((await api.act(tableId, { type: "ready", ready: !currentReady })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#start-private-game-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    await api.act(tableId, { type: "start", fillWithBots: false });
    await loadPrivateTable(tableId);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#start-with-bots-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    await api.act(tableId, { type: "start", fillWithBots: true });
    await loadPrivateTable(tableId);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#private-pass-button").addEventListener("click", () => privateAction({ type: "pass" }));
document.querySelector("#private-bid-button").addEventListener("click", () => privateAction({
  type: "contract", value: Number(choiceValue("private-contract-value")), suit: choiceValue("private-contract-suit")
}));
document.querySelector("#private-coinche-button").addEventListener("click", () => privateAction({ type: "coinche" }));
document.querySelector("#private-trump-button").addEventListener("click", () => privateAction({
  type: "trump", suit: choiceValue("private-contract-suit")
}));
document.querySelector("#private-next-round-button").addEventListener("click", () => privateAction({ type: "nextRound" }));
document.querySelector("#private-results-button").addEventListener("click", () => {
  reopenMatchEnd(`private:${privateTableId()}`);
});
// A rematch is proposed to the table (US-114): the screen stays open until the new match begins.
document.querySelector("#private-rematch-button").addEventListener("click", () => {
  privateAction({ type: "rematch" });
});

document.querySelector("#save-turn-timer-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    showPrivateTable((await api.act(tableId, { type: "settings", turnTimer: Number(choiceValue("turn-timer")) })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

choiceInputs("table-target").forEach((input) => input.addEventListener("change", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    const target = Number(choiceValue("table-target"));
    showPrivateTable((await api.act(tableId, { type: "settings", target })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
}));

choiceInputs("table-announcements").forEach((input) => input.addEventListener("change", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    const announcements = choiceValue("table-announcements") === "on";
    showPrivateTable((await api.act(tableId, { type: "settings", announcements })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
}));

choiceInputs("table-all-trumps").forEach((input) => input.addEventListener("change", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    const allTrumps = choiceValue("table-all-trumps") === "on";
    showPrivateTable((await api.act(tableId, { type: "settings", allTrumps })).table);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
}));

showBotGameInForm(savedBotGame());

// The setup forms only offer the option for Contrée.
[["variant", "solo-all-trumps-settings"], ["local-variant", "local-all-trumps-settings"]].forEach(([name, id]) => {
  const update = () => { document.querySelector(`#${id}`).hidden = choiceValue(name) !== "CONTREE"; };
  choiceInputs(name).forEach((input) => input.addEventListener("change", update));
  update();
});

document.querySelector("#copy-invitation-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.querySelector("#private-invitation-code").textContent);
  document.querySelector("#copy-invitation-code").textContent = t("Copied");
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) return;
  const destination = new URL(link.href).pathname;
  if (!isKnownRoute(destination)) return;
  event.preventDefault();
  navigate(destination, { confirmLeave: Boolean(link.dataset.confirmLeave) });
});

window.addEventListener("popstate", (event) => {
  if (!sheets.handlePopState(event)) renderView();
});
// Preset reactions at online tables (US-020): nothing is typed, and each player sees them in their own language.
const reactionLabels = {
  WELL_PLAYED: ["👏", "Well played!"],
  NICE_HAND: ["😎", "Nice hand!"],
  OOPS: ["😅", "Oops!"],
  WOW: ["😮", "Wow!"],
  THINKING: ["🤔", "Let me think…"],
  GOOD_GAME: ["🤝", "Good game!"]
};
let reactionsSeen = { tableId: null, sequence: 0 };

function reactionsEnabled() {
  try {
    return window.localStorage.getItem("beelot.reactions-enabled") !== "false";
  } catch (_) {
    return true;
  }
}

// Shows a reaction for a few seconds next to the seat it came from.
function showReaction(position, reaction) {
  const station = [...document.querySelectorAll('[id^="private-player-"]')]
    .find((item) => item.dataset.seatIndex === String(position));
  const label = reactionLabels[reaction];
  if (!station || !label) return;
  const placement = station.id.split("-").at(-1);
  const layer = document.querySelector("#private-reaction-layer");
  layer.querySelector(`.reaction-${placement}`)?.remove();
  const bubble = document.createElement("p");
  bubble.className = `reaction-bubble reaction-${placement}`;
  bubble.textContent = `${label[0]} ${t(label[1])}`;
  bubble.setAttribute("aria-label", t("{0}: {1}", playerName(station.dataset.playerName), t(label[1])));
  layer.append(bubble);
  window.setTimeout(() => bubble.remove(), 4000);
}

// Shows the reactions sent since the last refresh; a table opened anew starts after the reactions already sent.
function loadReactions(tableId, reactions) {
  if (!reactionsEnabled() || !reactions) return;
  const firstLoad = reactionsSeen.tableId !== tableId;
  if (firstLoad) reactionsSeen = { tableId, sequence: 0 };
  reactions.filter((item) => item.sequence > reactionsSeen.sequence).forEach((item) => {
    if (!firstLoad) showReaction(item.position, item.reaction);
    reactionsSeen.sequence = item.sequence;
  });
}

document.querySelectorAll("#private-reaction-bar .reaction-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const session = getPrivateSession();
    const message = document.querySelector("#private-reaction-message");
    message.textContent = "";
    if (!session) return;
    try {
      const snapshot = await api.act(session.tableId, { type: "react", reaction: button.dataset.reaction });
      const sent = snapshot.reactions.filter((item) => item.position === snapshot.you).at(-1);
      if (!sent) return;
      showReaction(sent.position, sent.reaction);
      if (reactionsSeen.tableId === session.tableId) reactionsSeen.sequence = Math.max(reactionsSeen.sequence, sent.sequence);
    } catch (error) {
      message.textContent = error.message;
    }
  });
});

document.querySelector("#bot-comments").addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.bot-comments", event.target.checked);
  } catch (_) {
    // Without storage the setting lasts until the page is reloaded.
  }
  applySettings();
});

document.querySelector("#reactions-enabled").addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.reactions-enabled", event.target.checked);
  } catch (_) {
    // Without storage the setting lasts until the page is reloaded.
  }
  applySettings();
});

// Without storage the chosen level lasts until the page is reloaded.
let sessionEffects = null;
let sessionTheme = null;

function applySettings() {
  const level = resolveEffectsLevel(storedSetting("beelot.effects") ?? sessionEffects, storedSetting("beelot.reduced-motion"),
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.body.dataset.effects = level;
  setChoice("effects", level);
  const theme = resolveTheme(storedSetting("beelot.theme") ?? sessionTheme);
  document.body.dataset.theme = theme;
  setChoice("theme", theme);
  document.querySelector("#sound-enabled").checked = window.localStorage.getItem("beelot.sound-enabled") !== "false";
  document.querySelector("#reactions-enabled").checked = reactionsEnabled();
  document.querySelector("#bot-comments").checked = botCommentsEnabled();
  if (!botCommentsEnabled()) clearBotLine();
  if (!reactionsEnabled()) {
    document.querySelector("#private-reaction-bar").hidden = true;
    document.querySelector("#private-reaction-layer").replaceChildren();
  }
}

function storedSetting(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

choiceInputs("effects").forEach((input) => input.addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.effects", event.target.value);
    window.localStorage.removeItem("beelot.reduced-motion");
  } catch (_) {
    sessionEffects = event.target.value;
  }
  applySettings();
}));
choiceInputs("theme").forEach((input) => input.addEventListener("change", (event) => {
  try {
    window.localStorage.setItem("beelot.theme", event.target.value);
  } catch (_) {
    sessionTheme = event.target.value;
  }
  applySettings();
}));
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applySettings);
setChoice("language", language);
choiceInputs("language").forEach((input) => input.addEventListener("change", (event) => setLanguage(event.target.value)));
document.querySelector("#sound-enabled").addEventListener("change", (event) => {
  window.localStorage.setItem("beelot.sound-enabled", event.target.checked);
  playSound("bid");
});
// The event stream carries the changes; a snapshot that arrived while calls were being revealed is drawn after them.
window.setInterval(() => {
  if (viewForPath(window.location.pathname) !== "private-table") return;
  const tableId = privateTableId();
  const latest = latestSnapshots.get(tableId);
  const rendered = renderedPrivateVersion.tableId === tableId ? renderedPrivateVersion.version : -1;
  if (latest && latest.version > rendered && !privateAuctionRevealing) loadPrivateTable(tableId);
}, 500);
window.setInterval(() => {
  if (!document.querySelector("#public-waiting").hidden) updatePublicCountdown();
}, 1000);

const statisticsLabels = {
  CLASSIC: "Classic Belote",
  CONTREE: "Contrée",
  RELAXED: "Relaxed",
  CHALLENGING: "Challenging",
  SOLO: "Against bots",
  PRIVATE: "Private table",
  PUBLIC: "Public table"
};

function statisticsLabel(key) {
  return t(statisticsLabels[key] ?? key);
}

function formatNumber(value) {
  return Number(value).toLocaleString(language);
}

function formatPercent(value) {
  return value == null ? "—" : `${formatNumber(value)} %`;
}

function tableRows(table, headings, rows) {
  const head = document.createElement("tr");
  head.replaceChildren(...headings.map((heading) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = t(heading);
    return cell;
  }));
  table.replaceChildren(head, ...rows.map((values) => {
    const row = document.createElement("tr");
    row.replaceChildren(...values.map((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
      return cell;
    }));
    return row;
  }));
}

function recordRows(records) {
  return records.map((record) => [statisticsLabel(record.key), formatNumber(record.played), formatNumber(record.won),
    formatNumber(record.lost), formatPercent(record.winRate)]);
}

// The signed-in player's statistics page; a guest is invited to sign in.
async function loadStatistics() {
  const guest = document.querySelector("#stats-guest");
  const empty = document.querySelector("#stats-empty");
  const error = document.querySelector("#stats-error");
  const content = document.querySelector("#stats-content");
  [guest, empty, error, content].forEach((element) => { element.hidden = true; });
  const response = await fetch("/api/statistics").catch(() => null);
  if (response?.status === 401) {
    guest.hidden = false;
    return;
  }
  const stats = response?.ok ? await response.json().catch(() => null) : null;
  if (!stats) {
    error.textContent = t("Something went wrong. Please try again.");
    error.hidden = false;
    return;
  }
  if (stats.overall.played === 0) {
    empty.hidden = false;
    return;
  }
  const tiles = [["Matches played", formatNumber(stats.overall.played)], ["Wins", formatNumber(stats.overall.won)],
    ["Losses", formatNumber(stats.overall.lost)], ["Win rate", formatPercent(stats.overall.winRate)]];
  document.querySelector("#stats-overall").replaceChildren(...tiles.map(([label, value]) => {
    const tile = document.createElement("p");
    tile.className = "stats-tile";
    const number = document.createElement("strong");
    number.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = t(label);
    tile.append(number, caption);
    return tile;
  }));
  const recordHeadings = ["", "Played", "Wins", "Losses", "Win rate"];
  tableRows(document.querySelector("#stats-variants"), recordHeadings, recordRows(stats.byVariant));
  tableRows(document.querySelector("#stats-difficulties"), recordHeadings, recordRows(stats.byDifficulty));

  const contracts = stats.contracts;
  const facts = [
    ["Contracts taken by your team", formatNumber(contracts.taken)],
    ["Contracts made", contracts.taken === 0 ? "—"
      : t("{0} ({1})", formatNumber(contracts.made), formatPercent(Math.round(100 * contracts.made / contracts.taken)))],
    ["Coinches by your team", t("{0}, {1} defeated the contract", formatNumber(contracts.coinchesByTeam),
      formatNumber(contracts.coinchesByTeamWon))],
    ["Coinches against your team", t("{0}, {1} defeated your contract", formatNumber(contracts.coinchesAgainstTeam),
      formatNumber(contracts.coinchesAgainstTeamWon))],
    ["Capots", formatNumber(contracts.capots)],
    ["Belotes", formatNumber(contracts.belotes)],
    ["Average points per round", stats.averagePointsPerRound == null ? "—" : formatNumber(stats.averagePointsPerRound)]
  ];
  document.querySelector("#stats-contracts").replaceChildren(...facts.flatMap(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = t(label);
    const description = document.createElement("dd");
    description.textContent = value;
    return [term, description];
  }));

  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  tableRows(document.querySelector("#stats-recent"),
    ["Date", "Mode", "Variant", "Target", "Partner", "Opponents", "Score", "Result"],
    stats.recentMatches.map((match) => {
      const result = document.createElement("span");
      result.className = match.won ? "stats-won" : "stats-lost";
      result.textContent = t(match.won ? "Won" : "Lost");
      const mode = match.mode === "SOLO" && match.difficulty
        ? t("{0} ({1})", statisticsLabel(match.mode), statisticsLabel(match.difficulty)) : statisticsLabel(match.mode);
      return [dateFormat.format(new Date(match.endedAt)), mode, statisticsLabel(match.variant),
        formatNumber(match.target), playerName(match.partner), match.opponents.map(playerName).join(", "),
        `${formatNumber(match.teamScore)} – ${formatNumber(match.opponentScore)}`, result];
    }));
  content.hidden = false;
}

// The "New to Belote?" banner (US-104) is for guests who have not finished or dismissed the tutorial.
let visitorSignedIn = false;
function updateTutorialBanner(signedIn = visitorSignedIn) {
  visitorSignedIn = signedIn;
  document.querySelector("#tutorial-banner").hidden = !shouldShowTutorialBanner({ seen: tutorialSeen(window.localStorage), signedIn });
}
document.querySelector("#tutorial-banner-dismiss").addEventListener("click", () => {
  markTutorialSeen(window.localStorage);
  updateTutorialBanner();
});

// Shows "Sign in" to a guest, or the signed-in player's pseudonym, on the home screen.
async function loadAccount() {
  let account;
  try {
    account = await apiJson("/api/account");
  } catch (_) {
    updateTutorialBanner(false);
    loadGoals(false);
    return;
  }
  updateTutorialBanner(account.signedIn);
  loadGoals(account.signedIn);
  document.querySelector("#account-guest").hidden = account.signedIn;
  document.querySelector("#account-signed-in").hidden = !account.signedIn;
  document.querySelector("#account-bar").hidden = false;
  document.querySelector("#your-data").hidden = !account.signedIn;
  const lastSignIn = document.querySelector("#account-last-sign-in");
  lastSignIn.hidden = !account.signedIn;
  if (!account.signedIn) return;
  document.querySelector("#account-name").textContent = t("Signed in as {0}", account.name);
  // The latest sign-in other than this one, so that the player can spot an access they did not make (US-077).
  lastSignIn.textContent = account.lastSignInAt
    ? t("Last sign-in: {0}", new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(account.lastSignInAt)))
    : t("This is your first sign-in.");
  document.querySelectorAll("#owner-name, #join-name, #public-name").forEach((input) => {
    if (input.value === t("Player")) input.value = account.name;
  });
}

// One sign-in panel serves the home screen and the statistics page: it moves to where it is opened.
const signInPanel = document.querySelector("#sign-in-panel");
const signInToggle = document.querySelector("#sign-in-toggle");
const passkeySignIn = document.querySelector("#passkey-sign-in");
const passkeySignUp = document.querySelector("#passkey-sign-up");
const passkeyConfirm = document.querySelector("#passkey-confirm");
const passkeyWarning = document.querySelector("#passkey-warning");
const passkeysSupported = Boolean(window.PublicKeyCredential && navigator.credentials);

function showSignUpWarning(shown) {
  passkeyWarning.hidden = !shown;
  passkeySignUp.setAttribute("aria-expanded", String(shown));
}

function openSignInPanel(container) {
  container.append(signInPanel);
  signInPanel.hidden = false;
  signInToggle.setAttribute("aria-expanded", String(container.id === "account-bar"));
  document.querySelector("#sign-in-status").textContent = "";
  showSignUpWarning(false);
  document.querySelector("#passkey-actions").hidden = !passkeysSupported;
  document.querySelector("#passkey-unsupported").hidden = passkeysSupported;
  if (passkeysSupported) passkeySignIn.focus();
}

signInToggle.addEventListener("click", () => {
  if (!signInPanel.hidden && signInPanel.parentElement.id === "account-bar") {
    signInPanel.hidden = true;
    signInToggle.setAttribute("aria-expanded", "false");
    return;
  }
  openSignInPanel(document.querySelector("#account-bar"));
});

document.querySelector("#stats-sign-in-button").addEventListener("click", () => {
  openSignInPanel(document.querySelector("#stats-guest"));
});

// Passkeys (US-084). WebAuthn's binary fields travel as base64url text, in the JSON of webauthn-rs: options come in
// a "publicKey" wrapper, and answers carry their extension results as "extensions".
function fromBase64url(text) {
  const binary = window.atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64url(buffer) {
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// A step of a ceremony that the server refused, with the response's status.
class CeremonyRefused extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function ceremonyStep(url, options = {}) {
  const response = await fetch(url, withCsrfToken({ method: "POST", ...options }));
  if (!response.ok) throw new CeremonyRefused(response.status);
  return response;
}

function jsonBody(value) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

// The untranslated message for a ceremony that failed. The server never says why a passkey was refused, and a
// cancelled browser dialog reads the same.
function ceremonyFailure(error) {
  if (error instanceof CeremonyRefused) {
    if (error.status === 429) return "Too many attempts. Please try again later.";
    if (error.status === 400 || error.status === 401) return "Sign-in did not complete. Please try again.";
    return "Something went wrong. Please try again.";
  }
  if (error instanceof DOMException) return "Sign-in did not complete. Please try again.";
  return "Something went wrong. Please try again.";
}

// Creates the account's one passkey; the server then signs the browser in. The pseudonym is in the interface's
// language.
async function signUpWithPasskey() {
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-up/options", {
    body: new URLSearchParams({ language })
  })).json();
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      user: { ...options.user, id: fromBase64url(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((known) => ({ ...known, id: fromBase64url(known.id) }))
    }
  });
  const { response } = credential;
  await ceremonyStep("/api/passkeys/sign-up", jsonBody({
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    response: {
      attestationObject: toBase64url(response.attestationObject),
      clientDataJSON: toBase64url(response.clientDataJSON)
    },
    type: credential.type,
    extensions: credential.getClientExtensionResults()
  }));
}

// Signs in with a passkey. A signed-in player is offered only their own account's passkey.
async function signInWithPasskey() {
  // The passkey says whose it is: no credential is named, and the browser shows its own passkey dialog.
  const { publicKey: options } = await (await ceremonyStep("/api/passkeys/sign-in/options")).json();
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((known) => ({ ...known, id: fromBase64url(known.id) }))
    }
  });
  const { response } = credential;
  await ceremonyStep("/api/passkeys/sign-in", jsonBody({
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    response: {
      authenticatorData: toBase64url(response.authenticatorData),
      clientDataJSON: toBase64url(response.clientDataJSON),
      signature: toBase64url(response.signature),
      userHandle: response.userHandle ? toBase64url(response.userHandle) : undefined
    },
    type: credential.type,
    extensions: credential.getClientExtensionResults()
  }));
}

async function runCeremony(ceremony) {
  const status = document.querySelector("#sign-in-status");
  const buttons = [passkeySignIn, passkeySignUp, passkeyConfirm];
  status.textContent = "";
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await ceremony();
  } catch (error) {
    status.textContent = t(ceremonyFailure(error));
    return;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
  signInPanel.hidden = true;
  signInToggle.setAttribute("aria-expanded", "false");
  await loadAccount();
  renderView();
}

passkeySignIn.addEventListener("click", () => runCeremony(signInWithPasskey));
passkeySignUp.addEventListener("click", () => showSignUpWarning(passkeyWarning.hidden));
passkeyConfirm.addEventListener("click", () => runCeremony(signUpWithPasskey));

// "Your data" in Settings (US-081, US-082): download a copy, or delete the account after a recent sign-in.
function showAccountNotice(text) {
  const bar = document.querySelector("#account-bar");
  bar.querySelector(".account-notice")?.remove();
  const notice = document.createElement("p");
  notice.className = "account-notice";
  notice.setAttribute("role", "status");
  notice.textContent = text;
  bar.prepend(notice);
  bar.hidden = false;
}

function attachmentName(response) {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match ? match[1] : "beelot-data.json";
}

document.querySelector("#export-data").addEventListener("click", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#export-message");
  message.textContent = "";
  try {
    const response = await fetch("/api/account/export");
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      message.textContent = t("You can download your data again in {0} minutes.", body.minutesLeft ?? 60);
      return;
    }
    if (!response.ok) throw new Error(String(response.status));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = attachmentName(response);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {
    message.textContent = t("Something went wrong. Please try again.");
  }
});

const deleteConfirm = document.querySelector("#delete-confirm");
const deleteWord = document.querySelector("#delete-confirm-word");
const deleteButton = document.querySelector("#delete-confirm-button");

function showDeleteConfirm() {
  deleteConfirm.hidden = false;
  deleteWord.value = "";
  deleteButton.disabled = true;
  document.querySelector("#delete-message").textContent = "";
  deleteWord.focus();
}

document.querySelector("#delete-account").addEventListener("click", showDeleteConfirm);

document.querySelector("#delete-cancel").addEventListener("click", () => {
  deleteConfirm.hidden = true;
});

deleteWord.addEventListener("input", () => {
  deleteButton.disabled = deleteWord.value.trim().toLocaleUpperCase() !== t("DELETE");
});

deleteButton.addEventListener("click", async () => {
  const message = document.querySelector("#delete-message");
  message.textContent = "";
  deleteButton.disabled = true;
  try {
    const response = await fetch("/api/account", withCsrfToken({ method: "DELETE" }));
    if (response.status === 204) {
      deleteConfirm.hidden = true;
      navigate("/");
      await loadAccount();
      showAccountNotice(t("Your account has been deleted."));
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 403 && body.reason === "reauthenticate") {
      message.textContent = t("For your safety, sign in again to delete your account.");
      try {
        await signInWithPasskey();
      } catch (error) {
        message.textContent = t(ceremonyFailure(error));
        deleteButton.disabled = false;
        return;
      }
      await loadAccount();
      showDeleteConfirm();
      return;
    }
    throw new Error(String(response.status));
  } catch (_) {
    message.textContent = t("Something went wrong. Please try again.");
    deleteButton.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    await fetch("/api/sign-out", withCsrfToken({ method: "POST" }));
  } catch (_) {
    // The session may already be gone; return home.
  }
  window.location.assign("/");
});
renderView();
applySettings();
loadAccount();
