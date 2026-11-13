// The card table: the shared renderer, hand layout, card flights and reactions tray.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
function stopLobbyCountdown() {
  window.clearInterval(lobbyCountdown);
  lobbyCountdown = null;
}

document.querySelector("#lobby-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#lobby-code").textContent);
    document.querySelector("#lobby-copy").textContent = t("Copied");
  } catch (_) { /* the code stays visible to copy by hand */ }
});
document.querySelector("#lobby-share").addEventListener("click", async () => {
  try {
    await navigator.share({ text: t("Join my Beelot table: code {0}", document.querySelector("#lobby-code").textContent) });
  } catch (_) { /* cancelled */ }
});
document.querySelector("#lobby-ready").addEventListener("click", () => {
  onlineAction(currentRouteId(), { type: "ready", ready: !lobbyModelState?.ready.on });
});
document.querySelector("#lobby-start").addEventListener("click", () => onlineAction(currentRouteId(), { type: "start", fillWithBots: false }));
document.querySelector("#lobby-start-bots").addEventListener("click", () => onlineAction(currentRouteId(), { type: "start", fillWithBots: true }));
document.querySelector("#lobby-leave").addEventListener("click", async () => {
  const tableId = currentRouteId();
  try {
    await api.act(tableId, { type: "leave" });
    closeTableStream();
    forgetTableSession(tableId);
    navigate("/online/public");
  } catch (error) {
    lobbyMessage(error.message);
  }
});
for (const [name, build] of [
  ["lobby-timer", () => ({ turnTimer: Number(choiceValue("lobby-timer")) })],
  ["lobby-announcements", () => ({ announcements: choiceValue("lobby-announcements") === "on" })],
  ["lobby-all-trumps", () => ({ allTrumps: choiceValue("lobby-all-trumps") === "on" })],
  ["lobby-target", () => ({ target: Number(choiceValue("lobby-target")) })]
]) {
  choiceInputs(name).forEach((input) => input.addEventListener("change", () => {
    onlineAction(currentRouteId(), { type: "settings", ...build() });
  }));
}

choiceInputs("lobby-spectators").forEach((input) => input.addEventListener("change", () => {
  onlineAction(currentRouteId(), { type: "spectators", allowed: choiceValue("lobby-spectators") === "on" });
}));

// The reaction tray (US-121): a button on the felt opens the six presets; a tap sends one and closes the tray.
// From 1024px the tray is a side panel that stays open (US-125); `force` closes it anyway.
function wideScreen() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function closeReactionTray(force = false) {
  if (wideScreen() && !force) return;
  document.querySelector("#tbl-reaction-tray").hidden = true;
  document.querySelector("#tbl-reactions-toggle").setAttribute("aria-expanded", "false");
}

document.querySelector("#tbl-reactions-toggle").addEventListener("click", () => {
  const tray = document.querySelector("#tbl-reaction-tray");
  tray.hidden = !tray.hidden;
  document.querySelector("#tbl-reactions-toggle").setAttribute("aria-expanded", String(!tray.hidden));
});
document.querySelectorAll("#tbl-reaction-tray .reaction-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const tableId = currentRouteId();
    closeReactionTray();
    try {
      const snapshot = await api.act(tableId, { type: "react", reaction: button.dataset.reaction });
      const sent = snapshot.reactions.filter((item) => item.position === snapshot.you).at(-1);
      if (!sent) return;
      showReaction(sent.position, sent.reaction);
      if (reactionsSeen.tableId === tableId) reactionsSeen.sequence = Math.max(reactionsSeen.sequence, sent.sequence);
    } catch (error) {
      setTableStatus(error.message);
    }
  });
});

const loadBotGame = (gameId) => renderSolo(gameId, soloScreens.legacy);
const loadTable = (gameId) => renderSolo(gameId, soloScreens.table);

async function renderSolo(gameId, ui, known = null) {
  const onTable = ui === soloScreens.table;
  const online = Boolean(known) || (onTable && onlineTable());
  if (onTable) setAuctionPhase(false);
  try {
    const snapshot = known ?? await api.table(gameId);
    const game = localGame(snapshot);
    const { board, match } = snapshot;
    if (!board) throw new Error("The auction has not finished.");
    announceGame(gameId, playView(board, match));
    leaveState = { kind: online ? "online" : "solo", matchComplete: Boolean(match?.complete) };
    if (!online) rememberSoloMatch(snapshot);
    const handedOff = handOff(game, board.currentPlayer);
    offerHint("#table-hint-button", gameId, !online && snapshot.table.hints && board.activePlayerIndex === board.currentPlayerIndex
      && !board.reviewingCompletedTrick && !board.roundResult);
    if (onTable) {
      document.querySelector("#tbl-title").textContent = t(game.variantLabel);
      document.querySelector("#table-menu-game").textContent = tableMenuTitle(snapshot.table, game);
    } else {
      document.querySelector("#selected-difficulty").textContent = t(game.difficultyLabel);
      document.querySelector("#selected-variant").textContent = t(game.variantLabel);
      document.querySelector("#game-variant-title").textContent = t(game.variantLabel);
    }
    // In pass and play, "You" waits for the hand-off, so the bar does not tell who holds the device next.
    if (tableShown(gameId)) {
      showScoreBar(match, board, game.passAndPlay ? null : board.currentPlayerIndex % 2);
    }
    const declaration = t(board.declarationMessage || "")
      + (board.beloteBonusPoints ? t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints) : "");
    if (onTable) {
      if (declaration.trim() && declaration !== toastedDeclaration) tableToaster.push(declaration, "declaration");
      toastedDeclaration = declaration;
      const declarers = (board.declarers || []).map((name) => t("{0} declares.", playerName(name))).join(" ");
      if (declarers && declarers !== toastedDeclarers) tableToaster.push(declarers, "declaration");
      toastedDeclarers = declarers;
      renderChips(board);
    } else {
      setSuitText(document.querySelector("#declaration-message"), declaration);
      renderAnnouncements("", board);
    }
    celebrateBelote(document.querySelector(ui.table), `bot:${gameId}`, board, handedOff);
    document.querySelector(ui.tricks).textContent = board.completedTricks;
    const currentTrick = document.querySelector(ui.trick);
    const secondDeal = !online && pendingSecondDeal?.gameId === gameId && pendingSecondDeal.viewer === board.currentPlayer
      && !motionReduced() ? pendingSecondDeal : null;
    pendingSecondDeal = null;
    const showTrick = () => {
      renderTrickDiamond(currentTrick, board.currentTrick, board.seats, board.activePlayerIndex, board.currentPlayerIndex,
        board.reviewingCompletedTrick ? { winner: board.trickWinner, points: board.trickPoints } : null, "");
      showBotStatus(board, game, false);
      if (board.reviewingCompletedTrick && !board.roundResult) collectBotTrickLater(gameId, board.completedTricks, currentTrick, online);
    };
    if (secondDeal) {
      currentTrick.replaceChildren();
      showBotStatus(board, game, true);
    } else {
      showTrick();
    }
    const result = document.querySelector(ui.result);
    revealAfterTrick(result, currentTrick, Boolean(board.roundResult));
    if (board.roundResult) {
      const round = board.roundResult;
      document.querySelector(ui.contract).textContent = t(round.contractMade ? "Contract made" : "Contract failed");
      document.querySelector(ui.breakdown).textContent = roundScoreText(round, board);
      document.querySelector(ui.next).hidden = match.complete;
      document.querySelector(ui.rematch).hidden = true;
      document.querySelector(ui.results).hidden = !match.complete;
      const reviewButton = document.querySelector(ui.review);
      reviewButton.hidden = !round.review?.length;
      reviewButton.onclick = () => openRoundReview(board, round, soloAnalysis(gameId));
      if (match.complete) document.querySelector(ui.contract).textContent = t("{0} win the match!", t(match.winner));
      celebrateRound(currentTrick, document.querySelector(ui.table), round, board, match, handedOff);
      celebrateMatchEnd(currentTrick, `bot:${gameId}`, board, match, handedOff,
        () => document.querySelector(ui.rematch).click());
    } else {
      resetMatchEnd(`bot:${gameId}`);
    }
    const seatsForBoard = (cardCount) => board.seats.map((seat, index) => ({
      ...seat, dealer: index === board.dealerIndex, cardCount: cardCount ?? seat.cardCount
    }));
    const seats = seatsForBoard(secondDeal ? secondDeal.hand.length : undefined);
    renderTableSeats(ui.prefix, seats, board.currentPlayerIndex, contractFromBoard(board));
    if (snapshot.bidding) botExpressionState.updateBidding(ui.prefix, seats, snapshot.bidding, match);
    botExpressionState.updateBoard(ui.prefix, board, match);
    fillHand(document.querySelector(ui.hand), board, (card) => playCard(gameId, card));
    await handedOff;
    if (tableShown(gameId)) showScoreBar(match, board, board.currentPlayerIndex % 2);
    if (secondDeal) await playSecondDeal(board, secondDeal.hand, seatsForBoard, showTrick, ui);
  } catch (error) {
    if (retryOnNetworkError(error, () => { if (tableShown(gameId)) reloadSolo(gameId); })) return;
    navigate(tableExitPath(), { replace: true });
  }
}

// After the auction, everyone receives three more cards; the taker gets two plus the upturned card.
async function playSecondDeal(board, previousHand, seatsForBoard, showTrick, ui = soloScreens.legacy) {
  const handElement = document.querySelector(ui.hand);
  const keyOf = (card) => `${card.rank}-${card.suit}`;
  const known = new Set(previousHand.map(keyOf));
  const placeInFan = (card, index, count) => {
    const fan = fanFor(index, count);
    card.style.setProperty("--fan-rot", `${fan.rotation}deg`);
    card.style.setProperty("--fan-y", `${fan.offsetY}px`);
  };
  // The hand held before the deal stays sorted, and the new cards sit after it in the order the pile gives them: they
  // are sorted in when the deal ends (US-140).
  const heldKeys = orderHandForDisplay(previousHand, board.trump).map(keyOf);
  const takesUpturned = board.declaringPlayerIndex === board.currentPlayerIndex;
  const arrival = arrivalOrder(heldKeys, (board.dealt ?? board.hand).map(keyOf), takesUpturned);
  const byKey = new Map([...handElement.children].map((card) => [card.dataset.card, card]));
  if (arrival.every((key) => byKey.has(key)) && arrival.length === byKey.size) {
    handElement.replaceChildren(...arrival.map((key) => byKey.get(key)));
    [...handElement.children].forEach((card, index, all) => placeInFan(card, index, all.length));
  }
  [...handElement.children].forEach((card) => {
    if (!known.has(card.dataset.card)) card.classList.add("undealt");
  });
  const seatNames = board.seats.map((seat) => seat.name);
  // The taker receives the upturned card and two more; everyone else receives three.
  const takerIndex = board.declaringPlayerIndex;
  await dealCards({
    prefix: ui.prefix, seatNames, dealerIndex: board.dealerIndex, startCount: previousHand.length, handElement,
    sortedKeys: orderHandForDisplay(board.hand, board.trump).map(keyOf), restyle: placeInFan,
    steps: [
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 2 : 3)) },
      { sizes: seatNames.map((_, index) => (index === takerIndex ? 1 : 0)), fromCenter: true }
    ]
  });
  renderTableSeats(ui.prefix, seatsForBoard(), board.currentPlayerIndex, contractFromBoard(board));
  showTrick();
}

async function playCard(gameId, card) {
  clearHint();
  try {
    await api.act(gameId, { type: "card", rank: card.rank, suit: card.suit, declare: soloDeclareChoice() });
    reloadSolo(gameId);
  } catch (error) {
    setTableStatus(error.message);
  }
}

// Collects a completed trick once it has been on the table long enough to be seen.
function collectBotTrickLater(gameId, completedTricks, container, online = false) {
  const key = `${gameId}:${completedTricks}`;
  if (pendingTrickCollection === key) return;
  pendingTrickCollection = key;
  window.setTimeout(async () => {
    if (pendingTrickCollection !== key || !tableShown(gameId)) return;
    pendingTrickCollection = "";
    // Online, the server collects the trick: the table asks for the newer state once the reveal time is up.
    if (online) {
      loadOnlineTable(gameId, { fresh: true });
      return;
    }
    try {
      await api.act(gameId, { type: "continueTrick" });
      reloadSolo(gameId);
    } catch (_) {
      // The trick was already collected; the table is up to date.
    }
  }, Number(container.dataset.revealMs || 0) + trickHoldDelay);
}

for (const ui of Object.values(soloScreens)) {
  document.querySelector(ui.next).addEventListener("click", async () => {
    const gameId = currentRouteId();
    if (onlineTable()) {
      onlineAction(gameId, { type: "nextRound" });
      return;
    }
    await api.act(gameId, { type: "nextRound" });
    lastDealKey = "";
    navigate(`/play/bot/bidding/${gameId}`);
  });

  document.querySelector(ui.results).addEventListener("click", () => {
    reopenMatchEnd(`bot:${currentRouteId()}`);
  });

  document.querySelector(ui.rematch).addEventListener("click", async () => {
    const gameId = currentRouteId();
    resetMatchEnd(`bot:${gameId}`);
    if (onlineTable()) {
      onlineAction(gameId, { type: "rematch" });
      return;
    }
    await api.act(gameId, { type: "rematch" });
    lastDealKey = "";
    navigate(`/play/bot/bidding/${gameId}`);
  });
}

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

// The analysis of a solo round; the server refuses it where several humans share the table (US-067), and the review
// then simply shows none.
function soloAnalysis(gameId) {
  return () => api.analysis(gameId);
}
