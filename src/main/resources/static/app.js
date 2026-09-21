const pathToView = {
  "/": "home",
  "/index.html": "home",
  "/play/ai": "ai",
  "/online/private": "private",
  "/tutorial": "tutorial",
  "/rules": "rules",
  "/settings": "settings"
};
const privateSessionKey = "beelot.private-table-session";
// A human needs time to follow each decision: a beat of "thinking", then the call stays in the spotlight.
const biddingThinkDelay = 900;
const biddingRevealDelay = 1900;
const ownCallDelay = 1000;
const trickRevealDelay = 650;
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
let lastDealKey = "";
let pendingSecondDeal = null;

function viewForPath(path) {
  if (path.startsWith("/play/ai/game/")) return "ai-game";
  if (path.startsWith("/play/ai/bidding/")) return "bidding";
  if (path.startsWith("/online/private/table/")) return "private-table";
  return pathToView[path] ?? "home";
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

// Amounts at or below the standing contract are illegal; preselect the lowest legal one.
function updateAmountChoices(name, highestBid) {
  const inputs = choiceInputs(name);
  inputs.forEach((input) => { input.disabled = Number(input.value) <= highestBid; });
  (inputs.find((input) => !input.disabled) ?? inputs.at(-1)).checked = true;
}

function privateTableId() {
  return window.location.pathname.split("/").at(-1);
}

function getPrivateSession() {
  const stored = window.sessionStorage.getItem(privateSessionKey);
  return stored ? JSON.parse(stored) : null;
}

function renderView() {
  const activeView = viewForPath(window.location.pathname);
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
  });
  document.title = activeView === "home"
    ? t("Beelot — Play Belote")
    : `${document.querySelector(`[data-view="${activeView}"] h1`).textContent} — Beelot`;

  if (activeView === "ai-game") loadAiGame(window.location.pathname.split("/").at(-1));
  if (activeView === "bidding") loadBidding(window.location.pathname.split("/").at(-1));
  if (activeView === "private-table") loadPrivateTable(privateTableId());
  if (activeView === "tutorial") showTutorialStep();
}

function showTutorialStep() {
  const step = tutorialSteps[tutorialStep];
  document.querySelector("#tutorial-progress").textContent = t("Lesson {0} of {1}", tutorialStep + 1, tutorialSteps.length);
  document.querySelector("#tutorial-title").textContent = t(step.title);
  document.querySelector("#tutorial-prompt").textContent = t(step.prompt);
  document.querySelector("#tutorial-feedback").textContent = t("Choose a card to continue.");
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
  document.querySelector("#tutorial-feedback").textContent = t(index === step.correct ? step.feedback : "Not quite. Look at the highlighted card, then try the next lesson.");
  document.querySelector("#tutorial-next-button").disabled = false;
}

function createSeat(seat, currentPlayerId) {
  const item = document.createElement("div");
  item.className = "seat";
  const name = document.createElement("strong");
  name.textContent = seat.playerId === currentPlayerId ? t("{0} (you)", playerName(seat.name)) : playerName(seat.name);
  const state = document.createElement("span");
  const connection = seat.connectionState === "AI_TAKEOVER" ? t("AI takeover") : seat.connectionState === "DISCONNECTED" ? t("Disconnected") : t("Connected");
  state.textContent = `${t(seat.ready ? "Ready" : "Waiting")} · ${connection}`;
  item.append(name, state);
  return item;
}

function showPrivateTable(table) {
  const snapshot = JSON.stringify(table);
  if (snapshot === lastRenderedPrivateTableJson) return;
  lastRenderedPrivateTableJson = snapshot;
  privateTableSnapshot = table;
  const session = getPrivateSession();
  const currentPlayerId = session?.tableId === table.id ? session.playerId : null;
  const currentSeat = table.seats.find((seat) => seat.playerId === currentPlayerId);
  const isOwner = currentPlayerId === table.ownerPlayerId;
  const allReady = table.seats.length === 4 && table.seats.every((seat) => seat.ready);
  const allSeatedReady = table.seats.every((seat) => seat.ready);

  document.querySelector("#private-invitation-code").textContent = table.invitationCode;
  document.querySelector("#private-table-status").textContent = table.status === "IN_PROGRESS" ? t("Game started") : t("Private table");
  document.querySelector('[data-view="private-table"] h1').textContent = table.status === "IN_PROGRESS"
    ? t(table.variantLabel) : t("Gather your team.");
  document.querySelector("#private-seat-list").replaceChildren(...table.seats.map((seat) => createSeat(seat, currentPlayerId)));
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
    ? t("Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by AI.", table.turnTimerSeconds)
    : t("Turn timer is disabled.");
  document.querySelector("#private-variant-summary").textContent = t("Variant: {0}", t(table.variantLabel));
  document.querySelector("#private-game-panel").hidden = table.status !== "IN_PROGRESS";
  document.querySelector("#private-lobby-help").hidden = table.status === "IN_PROGRESS";
  if (table.status === "IN_PROGRESS" && currentSeat) {
    const startingCards = table.variant === "CONTREE" ? 8 : 5;
    const seats = table.seats.map((seat, index) => ({
      name: seat.name, cardCount: startingCards, active: false,
      team: index % 2 === 0 ? "North–South" : "East–West"
    }));
    renderTableSeats("private", seats, table.seats.findIndex((seat) => seat.playerId === currentPlayerId));
  }
  document.querySelector("#private-table-message").textContent = table.status === "IN_PROGRESS"
    ? t("The game has started. Calls and card play update for every player automatically.")
    : "";
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(t(body.message ?? "Something went wrong. Please try again."));
  return body;
}

async function loadPrivateTable(tableId) {
  const requestId = ++privateTableRequestId;
  try {
    const session = getPrivateSession();
    if (session?.tableId === tableId) {
      await apiJson(`/api/private-tables/${tableId}/reconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerToken: session.playerToken })
      });
    }
    const table = await apiJson(`/api/private-tables/${tableId}`);
    if (requestId !== privateTableRequestId) return;
    showPrivateTable(table);
    if (table.status === "IN_PROGRESS") await loadPrivateGame(tableId, table.variant, requestId);
  } catch (error) {
    if (requestId !== privateTableRequestId) return;
    window.history.replaceState({}, "", "/online/private");
    document.querySelector("#private-form-message").textContent = t("That table is no longer available.");
    renderView();
  }
}

async function loadPrivateGame(tableId, variant, requestId = ++privateTableRequestId) {
  const session = getPrivateSession();
  if (!session) return;
  const panel = document.querySelector("#private-game-panel");
  panel.hidden = false;
  try {
    const board = await apiJson(`/api/private-tables/${tableId}/board?playerToken=${session.playerToken}`);
    if (requestId !== privateTableRequestId) return;
    renderPrivateBoard(tableId, board);
  } catch (_) {
    const bidding = await apiJson(`/api/private-tables/${tableId}/bidding?playerToken=${session.playerToken}`);
    if (requestId !== privateTableRequestId) return;
    renderPrivateBidding(bidding, variant);
  }
}

function renderPrivateBidding(bidding, variant) {
  const snapshot = variant + JSON.stringify(bidding);
  if (snapshot === lastRenderedPrivateBiddingJson) return;
  lastRenderedPrivateBiddingJson = snapshot;
  if (privateTableSnapshot) {
    const session = getPrivateSession();
    const currentPlayerIndex = privateTableSnapshot.seats.findIndex((seat) => seat.playerId === session?.playerId);
    const seats = privateTableSnapshot.seats.map((seat, index) => ({
      name: seat.name,
      cardCount: bidding.hand.length,
      active: seat.name === bidding.activePlayer,
      dealer: index === bidding.dealerIndex,
      team: index % 2 === 0 ? "North–South" : "East–West",
      call: bidding.calls.find((call) => call.playerName === seat.name)?.call ?? ""
    }));
    renderTableSeats("private", seats, currentPlayerIndex < 0 ? 0 : currentPlayerIndex);
  }
  document.querySelector("#private-game-heading").textContent = variant === "CONTREE" ? t("Contrée auction") : t("Choose trump");
  document.querySelector("#private-game-message").textContent = t(bidding.message);
  const privateTrick = document.querySelector("#private-current-trick");
  privateTrick.replaceChildren(...(bidding.upturnedCard ? [cardElement(bidding.upturnedCard)] : []));
  if (!bidding.upturnedCard) privateTrick.textContent = t("No upturned card in Contrée.");
  document.querySelector("#private-game-hand").replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));
  document.querySelector("#private-auction-actions").hidden = false;
  document.querySelector("#private-play-status").hidden = true;
  document.querySelector("#private-scoreboard").hidden = true;
  document.querySelector("#private-declaration-message").textContent = "";
  document.querySelector("#private-round-result").hidden = true;
  document.querySelector("#private-card-table").hidden = false;
  document.querySelector("#private-current-contract").textContent = bidding.highestBid
    ? t("Current contract: {0} {1} by {2}", bidding.highestBid, suitName(bidding.highestBidSuit, false), playerName(bidding.highestBidder)) : t("No contract yet");
  document.querySelector("#private-current-contract").hidden = variant !== "CONTREE";
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
  ensureEnabledChoice("private-contract-suit");
}

function renderPrivateBoard(tableId, board) {
  const snapshot = JSON.stringify(board);
  if (snapshot === lastRenderedPrivateBoardJson) return;
  lastRenderedPrivateBoardJson = snapshot;
  document.querySelector("#private-game-heading").textContent = board.variant === "CONTREE"
    ? `${board.contractValue} ${suitName(board.trump)}${board.coinched ? t(" · coinched") : ""}`
    : t("{0} are trump", suitName(board.trump));
  document.querySelector("#private-game-message").textContent = board.roundResult
    ? t(board.roundResult.contractMade ? "Contract made." : "Contract failed.")
    : t("{0}'s turn · {1} of 8 tricks completed", playerName(board.activePlayer), board.completedTricks);
  document.querySelector("#private-auction-actions").hidden = true;
  document.querySelector("#private-play-status").hidden = false;
  document.querySelector("#private-scoreboard").hidden = false;
  document.querySelector("#private-card-table").hidden = false;
  renderTableSeats("private", board.seats.map((seat, index) => ({ ...seat, dealer: index === board.dealerIndex })),
    board.currentPlayerIndex);
  document.querySelector("#private-trump").textContent = suitName(board.trump);
  document.querySelector("#private-declaring-team").textContent = t(board.declaringTeam);
  document.querySelector("#private-active-player").textContent = playerName(board.activePlayer);
  document.querySelector("#private-north-south-score").textContent = board.northSouthScore;
  document.querySelector("#private-east-west-score").textContent = board.eastWestScore;
  document.querySelector("#private-declaration-message").textContent = board.declarationMessage
    ? `${t(board.declarationMessage)}${board.beloteBonusPoints ? t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints) : ""}` : "";
  const privateTrick = document.querySelector("#private-current-trick");
  renderTrickDiamond(privateTrick, board.currentTrick, board.seats, board.activePlayerIndex, board.currentPlayerIndex,
    board.reviewingCompletedTrick ? { winner: board.trickWinner, points: board.trickPoints } : null);
  const legal = new Set(board.legalCards.map((card) => `${card.rank}-${card.suit}`));
  document.querySelector("#private-game-hand").replaceChildren(...orderHandForDisplay(board.hand, board.trump).map((card) => {
    const item = cardElement(card);
    if (legal.has(`${card.rank}-${card.suit}`)) {
      item.classList.add("legal-card");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", t("Play {0}", cardName(card)));
      item.addEventListener("click", () => privatePlayCard(tableId, card));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          privatePlayCard(tableId, card);
        }
      });
    }
    return item;
  }));
  revealAfterTrick(document.querySelector("#private-continue-button"), privateTrick,
    board.reviewingCompletedTrick && !board.roundResult);
  const result = document.querySelector("#private-round-result");
  revealAfterTrick(result, privateTrick, Boolean(board.roundResult));
  if (board.roundResult) {
    document.querySelector("#private-contract-result").textContent = t(board.roundResult.contractMade
      ? "Contract made" : "Contract failed");
    document.querySelector("#private-score-breakdown").textContent = roundScoreText(board.roundResult, board.coinched);
    soundAfterTrick(privateTrick, roundSound(board.roundResult, board.currentPlayerIndex % 2 === 0));
  }
}

async function privateAction(path, payload = {}) {
  const session = getPrivateSession();
  if (!session) return;
  const auctionAction = path.startsWith("bids/");
  const privatePanel = document.querySelector("#private-game-panel");
  if (auctionAction) privatePanel.classList.add("auction-waiting-view");
  try {
    if (auctionAction) {
      showPlayerCall("private", session.playerId, callLabel(path.split("/").at(-1), payload), true);
      await pause(ownCallDelay);
    }
    await apiJson(`/api/private-tables/${session.tableId}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken, ...payload })
    });
    await loadPrivateTable(session.tableId);
  } catch (error) {
    document.querySelector("#private-game-message").textContent = error.message;
  } finally {
    if (auctionAction) privatePanel.classList.remove("auction-waiting-view");
  }
}

function privatePlayCard(tableId, card) {
  privateAction("cards", { rank: card.rank, suit: card.suit });
}

function roundScoreText(round, coinched = false) {
  const detail = t("North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.",
    round.northSouthCardPoints, round.northSouthDixDeDer, round.northSouthBeloteBonus, round.northSouthAwarded,
    round.eastWestCardPoints, round.eastWestDixDeDer, round.eastWestBeloteBonus, round.eastWestAwarded);
  return coinched ? t("Coinche doubles the awarded scores. {0}", detail) : detail;
}

function enterPrivateTable(session) {
  window.sessionStorage.setItem(privateSessionKey, JSON.stringify({
    tableId: session.table.id,
    playerId: session.playerId,
    playerToken: session.playerToken
  }));
  window.history.pushState({}, "", `/online/private/table/${session.table.id}`);
  showPrivateTable(session.table);
  renderView();
}

async function loadAiGame(gameId) {
  try {
    const game = await apiJson(`/api/ai-games/${gameId}`);
    const board = await apiJson(`/api/ai-games/${gameId}/board`);
    const match = await apiJson(`/api/ai-games/${gameId}/match`);
    document.querySelector("#selected-difficulty").textContent = t(game.difficultyLabel);
    document.querySelector("#selected-variant").textContent = t(game.variantLabel);
    document.querySelector("#game-variant-title").textContent = t(game.variantLabel);
    document.querySelector("#contract-summary").textContent = board.variant === "CONTREE"
      ? t("Contract: {0} {1}{2}", board.contractValue, suitName(board.trump), board.coinched ? t(" · coinched") : "") : "";
    document.querySelector("#trump-suit").textContent = suitName(board.trump);
    document.querySelector("#declaring-team").textContent = t(board.declaringTeam);
    document.querySelector("#active-player").textContent = playerName(board.activePlayer);
    document.querySelector("#north-south-score").textContent = board.northSouthScore;
    document.querySelector("#east-west-score").textContent = board.eastWestScore;
    document.querySelector("#match-score").textContent = t("Match score — North–South {0} · East–West {1}", match.northSouth, match.eastWest);
    document.querySelector("#declaration-message").textContent = t(board.declarationMessage || "");
    if (board.beloteBonusPoints) {
      document.querySelector("#declaration-message").textContent += t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints);
    }
    document.querySelector("#completed-tricks").textContent = board.completedTricks;
    const currentTrick = document.querySelector("#current-trick");
    const secondDeal = pendingSecondDeal?.gameId === gameId && !motionReduced() ? pendingSecondDeal : null;
    pendingSecondDeal = null;
    const showTrick = () => {
      renderTrickDiamond(currentTrick, board.currentTrick, board.seats, board.activePlayerIndex, board.currentPlayerIndex,
        board.reviewingCompletedTrick ? { winner: board.trickWinner, points: board.trickPoints } : null);
      revealAfterTrick(document.querySelector("#continue-trick-button"), currentTrick,
        board.reviewingCompletedTrick && !board.roundResult);
    };
    if (secondDeal) {
      currentTrick.textContent = t("Dealing the remaining cards…");
      document.querySelector("#continue-trick-button").hidden = true;
    } else {
      showTrick();
    }
    const result = document.querySelector("#round-result");
    revealAfterTrick(result, currentTrick, Boolean(board.roundResult));
    if (board.roundResult) {
      const round = board.roundResult;
      document.querySelector("#contract-result").textContent = t(round.contractMade ? "Contract made" : "Contract failed");
      document.querySelector("#round-score-breakdown").textContent = roundScoreText(round, board.coinched);
      document.querySelector("#next-round-button").hidden = match.complete;
      document.querySelector("#rematch-button").hidden = !match.complete;
      if (match.complete) document.querySelector("#contract-result").textContent = t("{0} win the match!", t(match.winner));
      soundAfterTrick(currentTrick, match.complete ? (match.winner === "North–South" ? "matchWin" : "roundLose") : roundSound(round, true));
    }
    const seatsForBoard = (cardCount) => board.seats.map((seat, index) => ({
      ...seat, dealer: index === board.dealerIndex, cardCount: cardCount ?? seat.cardCount
    }));
    renderTableSeats("ai", seatsForBoard(secondDeal ? secondDeal.hand.length : undefined), board.currentPlayerIndex);
    const legal = new Set(board.legalCards.map((card) => `${card.rank}-${card.suit}`));
    document.querySelector("#card-hand").replaceChildren(...orderHandForDisplay(board.hand, board.trump).map((card) => {
      const item = cardElement(card);
      const isLegal = legal.has(`${card.rank}-${card.suit}`);
      item.classList.toggle("legal-card", isLegal);
      item.tabIndex = isLegal ? 0 : -1;
      if (isLegal) {
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", t("Play {0}", cardName(card)));
        item.addEventListener("click", () => playCard(gameId, card));
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            playCard(gameId, card);
          }
        });
      }
      return item;
    }));
    if (secondDeal) await playSecondDeal(board, secondDeal.hand, seatsForBoard, showTrick);
  } catch (error) {
    window.history.replaceState({}, "", "/play/ai");
    renderView();
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
  // Bots never take the upturned card, so the taker is the human player.
  const takerIndex = board.currentPlayerIndex;
  await dealCards({
    prefix: "ai", seatNames, dealerIndex: board.dealerIndex, startCount: previousHand.length, handElement,
    steps: [
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 2 : 3)) },
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 1 : 0)), fromCenter: true }
    ]
  });
  renderTableSeats("ai", seatsForBoard(), board.currentPlayerIndex);
  showTrick();
}

async function playCard(gameId, card) {
  try {
    await apiJson(`/api/ai-games/${gameId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rank: card.rank, suit: card.suit })
    });
    loadAiGame(gameId);
  } catch (error) {
    document.querySelector("#current-trick").textContent = error.message;
  }
}

document.querySelector("#continue-trick-button").addEventListener("click", async () => {
  const gameId = window.location.pathname.split("/").at(-1);
  await apiJson(`/api/ai-games/${gameId}/tricks/continue`, { method: "POST" });
  loadAiGame(gameId);
});

document.querySelector("#next-round-button").addEventListener("click", async () => {
  const gameId = window.location.pathname.split("/").at(-1);
  await apiJson(`/api/ai-games/${gameId}/rounds/next`, { method: "POST" });
  lastDealKey = "";
  window.history.pushState({}, "", `/play/ai/bidding/${gameId}`);
  renderView();
});

document.querySelector("#rematch-button").addEventListener("click", async () => {
  const gameId = window.location.pathname.split("/").at(-1);
  await apiJson(`/api/ai-games/${gameId}/rematch`, { method: "POST" });
  lastDealKey = "";
  window.history.pushState({}, "", `/play/ai/bidding/${gameId}`);
  renderView();
});

document.querySelector("#tutorial-next-button").addEventListener("click", () => {
  tutorialStep = (tutorialStep + 1) % tutorialSteps.length;
  showTutorialStep();
});
document.querySelector("#tutorial-replay-button").addEventListener("click", () => {
  tutorialStep = 0;
  showTutorialStep();
});

function cardElement(card) {
  const item = document.createElement("div");
  item.className = `playing-card ${card.suit.toLowerCase()}`;
  item.setAttribute("aria-label", cardName(card));
  item.dataset.rank = card.rank;

  const corner = (position) => {
    const index = document.createElement("span");
    index.className = `card-index card-index-${position}`;
    const rank = document.createElement("strong");
    rank.textContent = rankLabel(card.rank);
    const suit = document.createElement("span");
    suit.textContent = card.symbol;
    index.append(rank, suit);
    return index;
  };

  const face = document.createElement("span");
  face.className = "card-face";
  const pipLayouts = {
    "7": [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [5, 1], [5, 3]],
    "8": [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [4, 2], [5, 1], [5, 3]],
    "9": [[1, 1], [1, 3], [2, 1], [2, 3], [3, 2], [4, 1], [4, 3], [5, 1], [5, 3]],
    "10": [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3], [4, 1], [4, 3], [5, 1], [5, 3]]
  };
  const courtIcons = {
    CLUBS: { J: "♞︎", Q: "♛︎", K: "♚︎" },
    DIAMONDS: { J: "⚔︎", Q: "✦︎", K: "♔︎" },
    HEARTS: { J: "⚜︎", Q: "♕︎", K: "👑︎" },
    SPADES: { J: "🗡︎", Q: "❦︎", K: "♜︎" }
  };

  if (pipLayouts[card.rank]) {
    face.classList.add("pip-field");
    pipLayouts[card.rank].forEach(([row, column]) => {
      const pip = document.createElement("i");
      pip.className = "card-pip";
      pip.textContent = card.symbol;
      pip.style.setProperty("--pip-row", row);
      pip.style.setProperty("--pip-column", column);
      face.append(pip);
    });
  } else if (card.rank === "A") {
    face.classList.add("ace-face");
    face.textContent = card.symbol;
  } else {
    face.classList.add("court-face", `court-${card.suit.toLowerCase()}`);
    const figure = document.createElement("span");
    figure.className = "court-figure";
    figure.textContent = courtIcons[card.suit][card.rank];
    face.append(figure);
  }

  item.append(corner("top"), face, corner("bottom"));
  return item;
}

function orderHandForDisplay(cards, trump) {
  const normalRanks = ["7", "8", "9", "J", "Q", "K", "10", "A"];
  const trumpRanks = ["7", "8", "Q", "K", "10", "A", "9", "J"];
  const naturalSuits = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
  const trumpSuit = trump ? trump.toUpperCase() : "";
  const suits = trumpSuit
    ? [trumpSuit, ...naturalSuits.filter((suit) => suit !== trumpSuit)]
    : naturalSuits;

  return [...cards].sort((left, right) => {
    const suitDifference = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDifference !== 0) return suitDifference;
    const ranks = left.suit === trumpSuit ? trumpRanks : normalRanks;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}

function renderTrickDiamond(container, cards, seats, activePlayerIndex, currentPlayerIndex, result = null) {
  const previous = trickRenderState.get(container);
  const renderId = (previous?.renderId ?? 0) + 1;
  // Cards already on the table stay still; only cards played since the last render are revealed one by one.
  // A new trick (the previous one was reviewed and collected, or fewer cards are shown) starts from an empty table.
  const sameTrick = previous && cards.length >= previous.count && (!previous.reviewed || Boolean(result));
  const alreadyShown = previous ? (sameTrick ? previous.count : 0) : cards.length;
  const newCards = cards.length - alreadyShown;
  trickRenderState.set(container, { count: cards.length, renderId, reviewed: Boolean(result) });
  const revealMs = newCards * trickRevealDelay;
  container.dataset.revealMs = String(revealMs);

  if (!cards.length) {
    container.textContent = t("Play the opening card");
    return;
  }

  const diamond = document.createElement("div");
  diamond.className = "trick-diamond";
  const placements = ["bottom", "left", "top", "right"];
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
    if (playIndex >= alreadyShown) {
      playedCard.classList.add("card-arriving");
      playedCard.style.setProperty("--reveal-delay", `${(playIndex - alreadyShown) * trickRevealDelay}ms`);
      player.classList.add("card-arriving");
      player.style.setProperty("--reveal-delay", `${(playIndex - alreadyShown) * trickRevealDelay}ms`);
      window.setTimeout(() => {
        if (trickRenderState.get(container)?.renderId === renderId) playSound("card");
      }, (playIndex - alreadyShown) * trickRevealDelay);
    }
    slot.append(playedCard, player);
    if (result?.winner === seats[playerIndex].name) {
      const announceWinner = () => {
        slot.classList.add("trick-winner");
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
  container.replaceChildren(diamond);
}

// Plays a sound once the last card of the trick has landed, matching the delayed round-result reveal.
function soundAfterTrick(container, name) {
  const delay = Number(container.dataset.revealMs || 0);
  window.setTimeout(() => playSound(name), delay ? delay + 500 : 0);
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

function renderTableSeats(prefix, seats, currentPlayerIndex = 0) {
  const placements = ["bottom", "left", "top", "right"];
  placements.forEach((placement, offset) => {
    const seatIndex = (currentPlayerIndex + offset) % seats.length;
    const seat = seats[seatIndex];
    const station = document.querySelector(`#${prefix}-player-${placement}`);
    if (!station || !seat) return;
    station.classList.toggle("active-player", seat.active);
    station.dataset.playerName = seat.name;
    station.setAttribute("aria-label", t("{0}, {1}, {2}{3}", playerName(seat.name), t(seat.team), t(`${seat.cardCount} cards`), seat.active ? t(", active player") : ""));

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = seat.name.trim().slice(0, 1).toUpperCase();
    const details = document.createElement("span");
    details.className = "player-details";
    const name = document.createElement("strong");
    name.textContent = offset === 0 ? t("{0} · You", playerName(seat.name)) : playerName(seat.name);
    const meta = document.createElement("small");
    meta.className = "seat-meta";
    meta.dataset.team = seat.team;
    meta.textContent = `${t(seat.team)} · ${t(`${seat.cardCount} cards`)}`;
    details.append(name, meta);

    const contents = [avatar, details];
    if (seat.dealer) {
      const chip = document.createElement("span");
      chip.className = "dealer-chip";
      chip.textContent = "D";
      chip.title = t("Dealer");
      chip.setAttribute("aria-label", t("Dealer"));
      contents.push(chip);
    }
    if (seat.call) {
      const call = document.createElement("span");
      call.className = "player-call";
      call.textContent = callText(seat.call);
      call.dataset.kind = callKind(seat.call);
      call.dataset.red = /[♥♦]/.test(call.textContent);
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
  });
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

function motionReduced() {
  return document.body.classList.contains("reduced-motion")
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

// The text shown in a call bubble; suit names gain their symbol so the choice reads at a glance.
function callText(call) {
  return t(call).replace(suitTail, (suit) => `${suit} ${suitSymbols[suit.toLowerCase()]}`);
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
  if (existing?.textContent === text) return false;
  existing?.remove();
  // Earlier calls fade back so the newest one is always the focus.
  document.querySelectorAll(`[id^="${prefix}-player-"] .player-call`).forEach((old) => old.classList.add("stale"));
  const kind = callKind(call);
  const bubble = document.createElement("span");
  bubble.className = "player-call call-arriving";
  bubble.dataset.kind = kind;
  bubble.dataset.red = /[♥♦]/.test(text);
  bubble.textContent = text;
  station.append(bubble);
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
  const already = station.querySelector(".player-call:not(.player-thinking)")?.textContent === callText(call);
  if (already) return;
  const message = document.querySelector(`#${prefix}-message`);
  if (message) message.textContent = t(`${player} is deciding.`);
  const stopThinking = showThinking(station);
  await pause(biddingThinkDelay);
  stopThinking();
  if (showPlayerCall(prefix, player, call)) {
    if (message) message.textContent = callNarration(player, call);
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
    const [game, bidding] = await Promise.all([
      apiJson(`/api/ai-games/${gameId}`),
      apiJson(`/api/ai-games/${gameId}/bidding`)
    ]);
    document.querySelector("#bidding-message").textContent = t(bidding.message);
    const isContree = bidding.variant === "CONTREE";
    document.querySelector("#bidding-eyebrow").textContent = t(isContree ? "Contrée auction" : "Choose trump");
    document.querySelector("#bidding-variant").textContent = t("{0} · {1} AI", t(game.variantLabel), t(game.difficultyLabel));
    document.querySelector("#bidding-hand-label").textContent = t(isContree ? "Your eight-card hand" : "Your five-card hand");
    document.querySelector("#bidding-hand").setAttribute("aria-label", t(isContree ? "Your eight cards" : "Your five cards"));
    const currentPlayerIndex = game.seats.findIndex((seat) => seat.type === "HUMAN");
    const humanName = game.seats[currentPlayerIndex]?.name;
    const dealKey = `${gameId}:${bidding.dealerIndex}`;
    const animateDeal = dealKey !== lastDealKey && !motionReduced()
      && !bidding.calls.some((call) => call.playerName === humanName && call.call);
    lastDealKey = dealKey;
    pendingSecondDeal = isContree ? null : { gameId, hand: bidding.hand };
    const upturned = document.querySelector("#upturned-card");
    upturned.hidden = isContree || animateDeal;
    if (!isContree) upturned.replaceChildren(cardElement(bidding.upturnedCard));
    const handElement = document.querySelector("#bidding-hand");
    handElement.replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));
    if (animateDeal) handElement.childNodes.forEach((card) => card.classList.add("undealt"));
    renderTableSeats("bidding", game.seats.map((seat, index) => ({
      name: seat.name,
      cardCount: animateDeal ? 0 : bidding.hand.length,
      active: seat.name === bidding.activePlayer,
      dealer: index === bidding.dealerIndex,
      team: index % 2 === 0 ? "North–South" : "East–West",
      call: animateDeal ? "" : bidding.calls.find((call) => call.playerName === seat.name)?.call ?? ""
    })), currentPlayerIndex < 0 ? 0 : currentPlayerIndex);
    const isSecondRound = bidding.round === 2;
    document.querySelector("#accept-upturned-button").hidden = isContree || isSecondRound;
    document.querySelector("#trump-options").hidden = isContree || !isSecondRound;
    document.querySelector("#contree-options").hidden = !isContree;
    document.querySelector("#current-contract").textContent = bidding.highestBid
      ? t("Current contract: {0} {1} by {2}", bidding.highestBid, suitName(bidding.highestBidSuit, false), playerName(bidding.highestBidder))
      : t("No contract yet");
    updateAmountChoices("contract-value", bidding.highestBid);
    document.querySelector("#contract-bid-button").disabled = bidding.highestBid >= 160 || !bidding.playerTurn;
    document.querySelector("#pass-bid-button").disabled = !bidding.playerTurn;
    document.querySelector("#coinche-button").hidden = !bidding.coincheAllowed;
    document.querySelectorAll("#trump-options button").forEach((button) => {
      button.disabled = !bidding.upturnedCard || button.dataset.suit === bidding.upturnedCard.suit;
    });
    if (animateDeal) await playOpeningDeal(game, bidding, currentPlayerIndex);
  } catch (error) {
    window.history.replaceState({}, "", "/play/ai");
    renderView();
  }
}

async function submitBid(action, body) {
  const gameId = window.location.pathname.split("/").at(-1);
  const biddingView = document.querySelector("#bidding-card-table").closest("[data-view]");
  biddingView.classList.add("auction-waiting-view");
  try {
    const humanName = document.querySelector("#bidding-player-bottom").dataset.playerName;
    showPlayerCall("bidding", humanName, callLabel(action, body));
    await pause(ownCallDelay);
    const response = await apiJson(`/api/ai-games/${gameId}/bids/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.calls) await revealCalls("bidding", response.calls, humanName);
    if (action === "contract") {
      for (const station of ["left", "top", "right"]) {
        await announceCall("bidding", document.querySelector(`#bidding-player-${station}`).dataset.playerName, "Pass");
      }
    }
    if (action === "trump" || action === "contract" || action === "coinche" || response.complete) {
      window.history.pushState({}, "", `/play/ai/game/${gameId}`);
      renderView();
      return;
    }
    document.querySelector("#bidding-message").textContent = t(response.message);
    loadBidding(gameId);
  } catch (error) {
    document.querySelector("#bidding-message").textContent = error.message;
  } finally {
    biddingView.classList.remove("auction-waiting-view");
  }
}

document.querySelector("#ai-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const game = await apiJson("/api/ai-games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: form.get("difficulty"), variant: form.get("variant") })
  });
  window.history.pushState({}, "", `/play/ai/bidding/${game.id}`);
  renderView();
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
    const session = await apiJson("/api/private-tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: new FormData(event.currentTarget).get("playerName"), variant: choiceValue("private-variant") })
    });
    enterPrivateTable(session);
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#join-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const session = await apiJson("/api/private-tables/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: form.get("playerName"), invitationCode: form.get("invitationCode") })
    });
    enterPrivateTable(session);
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#ready-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  const seat = document.querySelectorAll("#private-seat-list .seat");
  if (!session || session.tableId !== tableId || !seat) return;
  const currentReady = document.querySelector("#ready-button").textContent === t("Not ready");
  try {
    showPrivateTable(await apiJson(`/api/private-tables/${tableId}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken, ready: !currentReady })
    }));
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#start-private-game-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    const table = await apiJson(`/api/private-tables/${tableId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken })
    });
    showPrivateTable(table);
    await loadPrivateGame(tableId, table.variant);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#start-with-bots-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    const table = await apiJson(`/api/private-tables/${tableId}/start-with-bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken })
    });
    showPrivateTable(table);
    await loadPrivateGame(tableId, table.variant);
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#private-pass-button").addEventListener("click", () => privateAction("bids/pass"));
document.querySelector("#private-bid-button").addEventListener("click", () => privateAction("bids/contract", {
  value: Number(choiceValue("private-contract-value")), suit: choiceValue("private-contract-suit")
}));
document.querySelector("#private-coinche-button").addEventListener("click", () => privateAction("bids/coinche"));
document.querySelector("#private-trump-button").addEventListener("click", () => privateAction("bids/trump", {
  suit: choiceValue("private-contract-suit")
}));
document.querySelector("#private-continue-button").addEventListener("click", () => privateAction("tricks/continue"));

document.querySelector("#save-turn-timer-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    showPrivateTable(await apiJson(`/api/private-tables/${tableId}/turn-timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken, seconds: Number(choiceValue("turn-timer")) })
    }));
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#copy-invitation-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.querySelector("#private-invitation-code").textContent);
  document.querySelector("#copy-invitation-code").textContent = t("Copied");
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) return;
  const destination = new URL(link.href).pathname;
  if (!(destination in pathToView)) return;
  event.preventDefault();
  window.history.pushState({}, "", destination);
  renderView();
});

window.addEventListener("popstate", renderView);
function applySettings() {
  const reducedMotion = window.localStorage.getItem("beelot.reduced-motion") === "true";
  document.body.classList.toggle("reduced-motion", reducedMotion);
  document.querySelector("#reduced-motion").checked = reducedMotion;
  document.querySelector("#sound-enabled").checked = window.localStorage.getItem("beelot.sound-enabled") !== "false";
}

document.querySelector("#reduced-motion").addEventListener("change", (event) => {
  window.localStorage.setItem("beelot.reduced-motion", event.target.checked);
  applySettings();
});
setChoice("language", language);
choiceInputs("language").forEach((input) => input.addEventListener("change", (event) => setLanguage(event.target.value)));
document.querySelector("#sound-enabled").addEventListener("change", (event) => {
  window.localStorage.setItem("beelot.sound-enabled", event.target.checked);
  playSound("bid");
});
window.addEventListener("pagehide", () => {
  const session = getPrivateSession();
  if (!session || viewForPath(window.location.pathname) !== "private-table") return;
  fetch(`/api/private-tables/${session.tableId}/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerToken: session.playerToken }),
    keepalive: true
  });
});
window.setInterval(() => {
  if (viewForPath(window.location.pathname) === "private-table") loadPrivateTable(privateTableId());
}, 3000);
renderView();
applySettings();
