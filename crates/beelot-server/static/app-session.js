// The resume record, policy and tutorial pages, the legacy private table, the table API.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
// A solo match in progress is remembered on the device, and forgotten once it is over (US-122).
function rememberSoloMatch(snapshot) {
  if (snapshot.table.kind !== "LOCAL" || snapshot.table.passAndPlay) return;
  if (snapshot.match?.complete) forgetResume(window.localStorage);
  else rememberResume(window.localStorage, snapshot.tableId, tableSession(snapshot.tableId)?.playerToken);
}

// The "Resume your match" card of home: shown only when the server still knows the match and it is not over.
async function loadResumeCard() {
  const card = document.querySelector("#resume-card");
  card.hidden = true;
  const record = readResume(window.localStorage);
  if (!record) return;
  try {
    const model = resumeCard(await api.table(record.tableId));
    if (!model) {
      forgetResume(window.localStorage);
      return;
    }
    if (viewForPath(window.location.pathname) !== "home") return;
    card.setAttribute("href", model.path);
    document.querySelector("#resume-detail").textContent =
      t("{0} · your team {1}, theirs {2}", t(model.variantLabel), model.yours, model.theirs);
    card.hidden = false;
  } catch (error) {
    if (error.status) forgetResume(window.localStorage);
  }
}

// The policy text is one file in the three languages; the operator's own values come from the server's environment,
// and one that is unset reads "not configured".
async function loadPolicyInfo() {
  let policy = null;
  let info = {};
  try {
    const [policyResponse, infoResponse] = await Promise.all([fetch("/privacy-policy.json"), fetch("/api/privacy/policy-info")]);
    if (policyResponse.ok) policy = await policyResponse.json();
    if (infoResponse.ok) info = await infoResponse.json();
  } catch (_) { /* the page keeps what it shows */ }
  if (!policy) return;
  renderPolicy(policyView(policy, info, language, t("not configured")), document.querySelector("#privacy-policy"), document);
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

// A request that gets no answer within this time is given up, so a bad connection never leaves the game waiting.
const requestTimeoutMs = 12000;
// Reading a table is safe to repeat: it is tried again after these pauses before the failure is shown.
const readRetryDelays = [500, 1500, 3500];

async function apiJsonOnce(url, options) {
  const control = new AbortController();
  const timer = window.setTimeout(() => control.abort(), requestTimeoutMs);
  let response;
  let body;
  try {
    response = await fetch(url, { ...withCsrfToken(options), signal: control.signal });
    body = await response.json().catch(() => ({}));
  } catch (cause) {
    // No answer (offline, dropped, or too slow): the request may or may not have reached the server.
    const error = new Error(t("The connection is slow or lost."));
    error.network = true;
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    const error = new Error(t(body.message ?? "Something went wrong. Please try again."));
    error.status = response.status;
    // A gateway or a restarting server answering for the game is a connection problem too.
    error.network = [502, 503, 504].includes(response.status);
    throw error;
  }
  return body;
}

async function apiJson(url, options = {}) {
  const readOnly = (options.method ?? "GET").toUpperCase() === "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const body = await apiJsonOnce(url, options);
      // An answer does not clear the note while the live stream is still down (US-142).
      if (!streamDropped) showConnectionTrouble(false);
      return body;
    } catch (error) {
      if (error.network) showConnectionTrouble(true);
      if (!error.network || !readOnly || attempt >= readRetryDelays.length) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, readRetryDelays[attempt]));
    }
  }
}

// After a failed load, the screen stays where it is and loads again in a few seconds, instead of leaving the table.
let connectionRetryTimer = 0;
function retryOnNetworkError(error, retry) {
  if (!error?.network) return false;
  window.clearTimeout(connectionRetryTimer);
  connectionRetryTimer = window.setTimeout(retry, 3000);
  return true;
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
    if (retryOnNetworkError(error, () => { if (privateTableId() === tableId) loadPrivateTable(tableId); })) return;
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

// Contrée (US-130): the bid is counted once, for the team that wins the contract, and shown as its own line.
function bidLine(round) {
  const team = round.northSouthBid > 0 ? "North–South" : round.eastWestBid > 0 ? "East–West" : null;
  return team ? ` ${t("Bid: {0} points go to {1}.", round.northSouthBid || round.eastWestBid, t(team))}` : "";
}

function roundScoreText(round, board) {
  const capot = !round.capotTeam ? "" : `${t("Capot! {0} take every trick and score 250.", t(round.capotTeam))} `;
  const detail = capot + t("North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.",
    round.northSouthCardPoints, round.northSouthDixDeDer, round.northSouthBeloteBonus, round.northSouthAwarded,
    round.eastWestCardPoints, round.eastWestDixDeDer, round.eastWestBeloteBonus, round.eastWestAwarded);
  const announcements = board.announcements ? ` ${announcementsLine(round, board)}` : "";
  return (board.coinched ? t("Coinche doubles the awarded scores. {0}", detail) : detail) + announcements + bidLine(round);
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
