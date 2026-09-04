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
const tutorialSteps = [
  { title: "Trump wins", prompt: "Hearts are trump. Which card is strongest?", cards: [{ rank: "A", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "HEARTS", symbol: "♥" }], correct: 1, feedback: "Correct. At trump, the jack is the strongest card." },
  { title: "Normal card strength", prompt: "Clubs are not trump. Which card wins this trick?", cards: [{ rank: "10", suit: "CLUBS", symbol: "♣" }, { rank: "A", suit: "CLUBS", symbol: "♣" }], correct: 1, feedback: "Correct. Outside trump, ace is stronger than 10." },
  { title: "Follow suit", prompt: "Hearts were led. Which card must you play if these are your choices?", cards: [{ rank: "7", suit: "HEARTS", symbol: "♥" }, { rank: "J", suit: "SPADES", symbol: "♠" }], correct: 0, feedback: "Correct. You must follow the lead suit when you can." },
  { title: "Take the trick", prompt: "Spades are trump and clubs were led. Which card takes this trick?", cards: [{ rank: "A", suit: "CLUBS", symbol: "♣" }, { rank: "7", suit: "SPADES", symbol: "♠" }], correct: 1, feedback: "Correct. A trump card beats cards in the lead suit." }
];
let tutorialStep = 0;

function viewForPath(path) {
  if (path.startsWith("/play/ai/game/")) return "ai-game";
  if (path.startsWith("/play/ai/bidding/")) return "bidding";
  if (path.startsWith("/online/private/table/")) return "private-table";
  return pathToView[path] ?? "home";
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
    ? "Beelot — Play Belote"
    : `${document.querySelector(`[data-view="${activeView}"] h1`).textContent} — Beelot`;

  if (activeView === "ai-game") loadAiGame(window.location.pathname.split("/").at(-1));
  if (activeView === "bidding") loadBidding(window.location.pathname.split("/").at(-1));
  if (activeView === "private-table") loadPrivateTable(privateTableId());
  if (activeView === "tutorial") showTutorialStep();
}

function showTutorialStep() {
  const step = tutorialSteps[tutorialStep];
  document.querySelector("#tutorial-progress").textContent = `Lesson ${tutorialStep + 1} of ${tutorialSteps.length}`;
  document.querySelector("#tutorial-title").textContent = step.title;
  document.querySelector("#tutorial-prompt").textContent = step.prompt;
  document.querySelector("#tutorial-feedback").textContent = "Choose a card to continue.";
  document.querySelector("#tutorial-next-button").disabled = true;
  document.querySelector("#tutorial-next-button").textContent = tutorialStep === tutorialSteps.length - 1 ? "Finish tutorial" : "Next lesson";
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
  document.querySelector("#tutorial-feedback").textContent = index === step.correct ? step.feedback : "Not quite. Look at the highlighted card, then try the next lesson.";
  document.querySelector("#tutorial-next-button").disabled = false;
}

function createSeat(seat, currentPlayerId) {
  const item = document.createElement("div");
  item.className = "seat";
  const name = document.createElement("strong");
  name.textContent = seat.playerId === currentPlayerId ? `${seat.name} (you)` : seat.name;
  const state = document.createElement("span");
  const connection = seat.connectionState === "AI_TAKEOVER" ? "AI takeover" : seat.connectionState === "DISCONNECTED" ? "Disconnected" : "Connected";
  state.textContent = `${seat.ready ? "Ready" : "Waiting"} · ${connection}`;
  item.append(name, state);
  return item;
}

function showPrivateTable(table) {
  const session = getPrivateSession();
  const currentPlayerId = session?.tableId === table.id ? session.playerId : null;
  const currentSeat = table.seats.find((seat) => seat.playerId === currentPlayerId);
  const isOwner = currentPlayerId === table.ownerPlayerId;
  const allReady = table.seats.length === 4 && table.seats.every((seat) => seat.ready);

  document.querySelector("#private-invitation-code").textContent = table.invitationCode;
  document.querySelector("#private-table-status").textContent = table.status === "IN_PROGRESS" ? "Game started" : "Private table";
  document.querySelector('[data-view="private-table"] h1').textContent = table.status === "IN_PROGRESS"
    ? table.variantLabel : "Gather your team.";
  document.querySelector("#private-seat-list").replaceChildren(...table.seats.map((seat) => createSeat(seat, currentPlayerId)));
  const readyButton = document.querySelector("#ready-button");
  readyButton.hidden = !currentSeat || table.status === "IN_PROGRESS";
  readyButton.textContent = currentSeat?.ready ? "Not ready" : "I am ready";
  const startButton = document.querySelector("#start-private-game-button");
  startButton.hidden = !isOwner || table.status === "IN_PROGRESS";
  startButton.disabled = !allReady;
  const timerSettings = document.querySelector("#timer-settings");
  timerSettings.hidden = !isOwner || table.status === "IN_PROGRESS";
  document.querySelector("#turn-timer-select").value = table.turnTimerSeconds;
  document.querySelector("#timer-policy").textContent = table.turnTimerSeconds
    ? `Turn timer: ${table.turnTimerSeconds} seconds. A warning appears with 10 seconds remaining; an expired turn is played by AI.`
    : "Turn timer is disabled.";
  document.querySelector("#private-variant-summary").textContent = `Variant: ${table.variantLabel}`;
  document.querySelector("#private-game-panel").hidden = table.status !== "IN_PROGRESS";
  document.querySelector("#private-lobby-help").hidden = table.status === "IN_PROGRESS";
  document.querySelector("#private-table-message").textContent = table.status === "IN_PROGRESS"
    ? "The game has started. Calls and card play update for every player automatically."
    : "";
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "Something went wrong. Please try again.");
  return body;
}

async function loadPrivateTable(tableId) {
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
    showPrivateTable(table);
    if (table.status === "IN_PROGRESS") await loadPrivateGame(tableId, table.variant);
  } catch (error) {
    window.history.replaceState({}, "", "/online/private");
    document.querySelector("#private-form-message").textContent = "That table is no longer available.";
    renderView();
  }
}

async function loadPrivateGame(tableId, variant) {
  const session = getPrivateSession();
  if (!session) return;
  const panel = document.querySelector("#private-game-panel");
  panel.hidden = false;
  try {
    const board = await apiJson(`/api/private-tables/${tableId}/board?playerToken=${session.playerToken}`);
    renderPrivateBoard(tableId, board);
  } catch (_) {
    const bidding = await apiJson(`/api/private-tables/${tableId}/bidding?playerToken=${session.playerToken}`);
    renderPrivateBidding(bidding, variant);
  }
}

function renderPrivateBidding(bidding, variant) {
  document.querySelector("#private-game-heading").textContent = variant === "CONTREE" ? "Contrée auction" : "Choose trump";
  document.querySelector("#private-game-message").textContent = bidding.message;
  const privateTrick = document.querySelector("#private-current-trick");
  privateTrick.replaceChildren(...(bidding.upturnedCard ? [cardElement(bidding.upturnedCard)] : []));
  if (!bidding.upturnedCard) privateTrick.textContent = "No upturned card in Contrée.";
  document.querySelector("#private-game-hand").replaceChildren(...bidding.hand.map(cardElement));
  document.querySelector("#private-auction-actions").hidden = false;
  document.querySelector("#private-play-status").hidden = true;
  document.querySelector("#private-scoreboard").hidden = true;
  document.querySelector("#private-declaration-message").textContent = "";
  document.querySelector("#private-trick-result").textContent = "";
  document.querySelector("#private-round-result").hidden = true;
  document.querySelector("#private-current-contract").textContent = bidding.highestBid
    ? `Current contract: ${bidding.highestBid} ${bidding.highestBidSuit.toLowerCase()} by ${bidding.highestBidder}` : "No contract yet";
  document.querySelector("#private-current-contract").hidden = variant !== "CONTREE";
  document.querySelector("#private-contract-value").value = String(Math.min(160, Math.max(80, bidding.highestBid + 10)));
  document.querySelector("#private-bid-button").hidden = variant !== "CONTREE";
  document.querySelector("#private-coinche-button").hidden = !bidding.coincheAllowed;
  document.querySelector("#private-trump-button").hidden = variant === "CONTREE";
  document.querySelector("#private-trump-button").textContent = bidding.round === 1 ? "Accept upturned suit" : "Choose trump";
  document.querySelector("#private-contract-value").hidden = variant !== "CONTREE";
  document.querySelector('label[for="private-contract-value"]').hidden = variant !== "CONTREE";
  if (variant !== "CONTREE" && bidding.round === 1 && bidding.upturnedCard) {
    document.querySelector("#private-contract-suit").value = bidding.upturnedCard.suit;
  }
  document.querySelector("#private-bid-button").disabled = !bidding.playerTurn || bidding.highestBid >= 160;
  document.querySelector("#private-trump-button").disabled = !bidding.playerTurn;
  document.querySelector("#private-pass-button").disabled = !bidding.playerTurn;
  document.querySelectorAll("#private-contract-suit option").forEach((option) => {
    option.disabled = variant !== "CONTREE" && bidding.round === 2 && option.value === bidding.upturnedCard?.suit;
  });
}

function renderPrivateBoard(tableId, board) {
  document.querySelector("#private-game-heading").textContent = board.variant === "CONTREE"
    ? `${board.contractValue} ${board.trump}${board.coinched ? " · coinched" : ""}`
    : `${board.trump} are trump`;
  document.querySelector("#private-game-message").textContent = board.roundResult
    ? (board.roundResult.contractMade ? "Contract made." : "Contract failed.")
    : `${board.activePlayer}'s turn · ${board.completedTricks} of 8 tricks completed`;
  document.querySelector("#private-auction-actions").hidden = true;
  document.querySelector("#private-play-status").hidden = false;
  document.querySelector("#private-scoreboard").hidden = false;
  document.querySelector("#private-trump").textContent = board.trump;
  document.querySelector("#private-declaring-team").textContent = board.declaringTeam;
  document.querySelector("#private-active-player").textContent = board.activePlayer;
  document.querySelector("#private-north-south-score").textContent = board.northSouthScore;
  document.querySelector("#private-east-west-score").textContent = board.eastWestScore;
  document.querySelector("#private-declaration-message").textContent = board.declarationMessage
    ? `${board.declarationMessage}${board.beloteBonusPoints ? ` Belote/Rebelote bonus: ${board.beloteBonusPoints} points.` : ""}` : "";
  document.querySelector("#private-trick-result").textContent = board.reviewingCompletedTrick
    ? `${board.trickWinner} takes this trick for ${board.trickPoints} points.` : "";
  const privateTrick = document.querySelector("#private-current-trick");
  privateTrick.replaceChildren(...board.currentTrick.map(cardElement));
  if (!board.currentTrick.length) privateTrick.textContent = "No cards played yet.";
  const legal = new Set(board.legalCards.map((card) => `${card.rank}-${card.suit}`));
  document.querySelector("#private-game-hand").replaceChildren(...board.hand.map((card) => {
    const item = cardElement(card);
    if (legal.has(`${card.rank}-${card.suit}`)) {
      item.classList.add("legal-card");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Play ${card.rank} of ${card.suit.toLowerCase()}`);
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
  document.querySelector("#private-continue-button").hidden = !board.reviewingCompletedTrick || Boolean(board.roundResult);
  const result = document.querySelector("#private-round-result");
  result.hidden = !board.roundResult;
  if (board.roundResult) {
    document.querySelector("#private-contract-result").textContent = board.roundResult.contractMade
      ? "Contract made" : "Contract failed";
    document.querySelector("#private-score-breakdown").textContent = roundScoreText(board.roundResult, board.coinched);
  }
}

async function privateAction(path, payload = {}) {
  const session = getPrivateSession();
  if (!session) return;
  try {
    await apiJson(`/api/private-tables/${session.tableId}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken, ...payload })
    });
    await loadPrivateTable(session.tableId);
  } catch (error) {
    document.querySelector("#private-game-message").textContent = error.message;
  }
}

function privatePlayCard(tableId, card) {
  privateAction("cards", { rank: card.rank, suit: card.suit });
}

function roundScoreText(round, coinched = false) {
  const detail = `North–South: ${round.northSouthCardPoints} card points + ${round.northSouthDixDeDer} Dix de der + ${round.northSouthBeloteBonus} Belote = ${round.northSouthAwarded}. East–West: ${round.eastWestCardPoints} card points + ${round.eastWestDixDeDer} Dix de der + ${round.eastWestBeloteBonus} Belote = ${round.eastWestAwarded}.`;
  return coinched ? `Coinche doubles the awarded scores. ${detail}` : detail;
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
    document.querySelector("#selected-difficulty").textContent = game.difficultyLabel;
    document.querySelector("#selected-variant").textContent = game.variantLabel;
    document.querySelector("#game-variant-title").textContent = game.variantLabel;
    document.querySelector("#contract-summary").textContent = board.variant === "CONTREE"
      ? `Contract: ${board.contractValue} ${board.trump}${board.coinched ? " · coinched" : ""}` : "";
    document.querySelector("#trump-suit").textContent = board.trump;
    document.querySelector("#declaring-team").textContent = board.declaringTeam;
    document.querySelector("#active-player").textContent = board.activePlayer;
    document.querySelector("#north-south-score").textContent = board.northSouthScore;
    document.querySelector("#east-west-score").textContent = board.eastWestScore;
    document.querySelector("#match-score").textContent = `Match score — North–South ${match.northSouth} · East–West ${match.eastWest}`;
    document.querySelector("#declaration-message").textContent = board.declarationMessage || "";
    if (board.beloteBonusPoints) {
      document.querySelector("#declaration-message").textContent += ` Belote/Rebelote bonus: ${board.beloteBonusPoints} points.`;
    }
    document.querySelector("#completed-tricks").textContent = board.completedTricks;
    const currentTrick = document.querySelector("#current-trick");
    currentTrick.replaceChildren(...(board.currentTrick.length ? board.currentTrick : []).map(cardElement));
    if (!board.currentTrick.length) currentTrick.textContent = "No cards played yet.";
    document.querySelector("#trick-result").textContent = board.reviewingCompletedTrick
      ? `${board.trickWinner} takes this trick for ${board.trickPoints} points.` : "";
    document.querySelector("#continue-trick-button").hidden = !board.reviewingCompletedTrick || Boolean(board.roundResult);
    const result = document.querySelector("#round-result");
    result.hidden = !board.roundResult;
    if (board.roundResult) {
      const round = board.roundResult;
      document.querySelector("#contract-result").textContent = round.contractMade ? "Contract made" : "Contract failed";
      document.querySelector("#round-score-breakdown").textContent = roundScoreText(round, board.coinched);
      document.querySelector("#next-round-button").hidden = match.complete;
      document.querySelector("#rematch-button").hidden = !match.complete;
      if (match.complete) document.querySelector("#contract-result").textContent = `${match.winner} win the match!`;
    }
    document.querySelector("#seat-list").replaceChildren(...board.seats.map((seat) => {
      const item = document.createElement("div");
      item.className = "seat";
      item.textContent = `${seat.name} · ${seat.team} · ${seat.cardCount} cards${seat.active ? " · active" : ""}`;
      return item;
    }));
    const legal = new Set(board.legalCards.map((card) => `${card.rank}-${card.suit}`));
    document.querySelector("#card-hand").replaceChildren(...board.hand.map((card) => {
      const item = cardElement(card);
      const isLegal = legal.has(`${card.rank}-${card.suit}`);
      item.classList.toggle("legal-card", isLegal);
      item.tabIndex = isLegal ? 0 : -1;
      if (isLegal) {
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Play ${card.rank} of ${card.suit.toLowerCase()}`);
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
  } catch (error) {
    window.history.replaceState({}, "", "/play/ai");
    renderView();
  }
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
  window.history.pushState({}, "", `/play/ai/bidding/${gameId}`);
  renderView();
});

document.querySelector("#rematch-button").addEventListener("click", async () => {
  const gameId = window.location.pathname.split("/").at(-1);
  await apiJson(`/api/ai-games/${gameId}/rematch`, { method: "POST" });
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
  item.setAttribute("aria-label", `${card.rank} of ${card.suit.toLowerCase()}`);
  item.textContent = `${card.rank}${card.symbol}`;
  return item;
}

async function loadBidding(gameId) {
  try {
    const bidding = await apiJson(`/api/ai-games/${gameId}/bidding`);
    document.querySelector("#bidding-message").textContent = bidding.message;
    const isContree = bidding.variant === "CONTREE";
    document.querySelector("#bidding-eyebrow").textContent = isContree ? "Contrée auction" : "Choose trump";
    document.querySelector("#bidding-hand-label").textContent = isContree ? "Your eight-card hand" : "Your five-card hand";
    document.querySelector("#bidding-hand").setAttribute("aria-label", isContree ? "Your eight cards" : "Your five cards");
    document.querySelector("#upturned-card").hidden = isContree;
    if (!isContree) document.querySelector("#upturned-card").replaceChildren(cardElement(bidding.upturnedCard));
    document.querySelector("#bidding-hand").replaceChildren(...bidding.hand.map(cardElement));
    const isSecondRound = bidding.round === 2;
    document.querySelector("#accept-upturned-button").hidden = isContree || isSecondRound;
    document.querySelector("#trump-options").hidden = isContree || !isSecondRound;
    document.querySelector("#contree-options").hidden = !isContree;
    document.querySelector("#current-contract").textContent = bidding.highestBid
      ? `Current contract: ${bidding.highestBid} ${bidding.highestBidSuit.toLowerCase()} by ${bidding.highestBidder}`
      : "No contract yet";
    document.querySelector("#contract-value").value = String(Math.min(160, Math.max(80, bidding.highestBid + 10)));
    document.querySelector("#contract-bid-button").disabled = bidding.highestBid >= 160 || !bidding.playerTurn;
    document.querySelector("#pass-bid-button").disabled = !bidding.playerTurn;
    document.querySelector("#coinche-button").hidden = !bidding.coincheAllowed;
    document.querySelectorAll("#trump-options button").forEach((button) => {
      button.disabled = !bidding.upturnedCard || button.dataset.suit === bidding.upturnedCard.suit;
    });
  } catch (error) {
    window.history.replaceState({}, "", "/play/ai");
    renderView();
  }
}

async function submitBid(action, body) {
  const gameId = window.location.pathname.split("/").at(-1);
  try {
    const response = await apiJson(`/api/ai-games/${gameId}/bids/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (action === "trump" || action === "contract" || action === "coinche" || response.complete) {
      window.history.pushState({}, "", `/play/ai/game/${gameId}`);
      renderView();
      return;
    }
    document.querySelector("#bidding-message").textContent = response.message;
    loadBidding(gameId);
  } catch (error) {
    document.querySelector("#bidding-message").textContent = error.message;
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
  value: Number(document.querySelector("#contract-value").value),
  suit: document.querySelector("#contract-suit").value
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
      body: JSON.stringify({ playerName: new FormData(event.currentTarget).get("playerName"), variant: new FormData(event.currentTarget).get("variant") })
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
  const currentReady = document.querySelector("#ready-button").textContent === "Not ready";
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

document.querySelector("#private-pass-button").addEventListener("click", () => privateAction("bids/pass"));
document.querySelector("#private-bid-button").addEventListener("click", () => privateAction("bids/contract", {
  value: Number(document.querySelector("#private-contract-value").value), suit: document.querySelector("#private-contract-suit").value
}));
document.querySelector("#private-coinche-button").addEventListener("click", () => privateAction("bids/coinche"));
document.querySelector("#private-trump-button").addEventListener("click", () => privateAction("bids/trump", {
  suit: document.querySelector("#private-contract-suit").value
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
      body: JSON.stringify({ playerToken: session.playerToken, seconds: Number(document.querySelector("#turn-timer-select").value) })
    }));
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#copy-invitation-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.querySelector("#private-invitation-code").textContent);
  document.querySelector("#copy-invitation-code").textContent = "Copied";
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
document.querySelector("#sound-enabled").addEventListener("change", (event) => {
  window.localStorage.setItem("beelot.sound-enabled", event.target.checked);
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
