// Calls, the opening deal, the auction views and starting a game.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
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
async function playOpeningDeal(game, bidding, humanIndex, ui = auctionScreens.legacy) {
  const controls = [...document.querySelectorAll(ui.controls)];
  const wasDisabled = controls.map((button) => button.disabled);
  controls.forEach((button) => { button.disabled = true; });
  const seatNames = game.seats.map((seat) => seat.name);
  const handSize = bidding.hand.length;
  const steps = firstDealSteps[bidding.variant].map((size) => ({ sizes: seatNames.map(() => size) }));
  await dealCards({
    prefix: ui.prefix, seatNames, dealerIndex: bidding.dealerIndex, steps, startCount: 0,
    handElement: document.querySelector(ui.hand),
    sortedKeys: orderHandForDisplay(bidding.hand).map((card) => `${card.rank}-${card.suit}`)
  });
  const upturned = ui.upturned && document.querySelector(ui.upturned);
  if (upturned && bidding.upturnedCard) {
    upturned.hidden = false;
    upturned.classList.add("call-arriving");
    await pause(ownCallDelay);
  }
  const bidOrder = (name) => (seatNames.indexOf(name) - bidding.dealerIndex - 1 + seatNames.length) % seatNames.length;
  const earlyCalls = bidding.calls.filter((call) => call.call && call.playerName !== seatNames[humanIndex])
    .sort((left, right) => bidOrder(left.playerName) - bidOrder(right.playerName));
  for (const call of earlyCalls) {
    await announceCall(ui.prefix, call.playerName, call.call);
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
    document.querySelector("#table-menu-game").textContent = document.querySelector("#bidding-variant").textContent;
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
    // While the deal is animated the cards sit in the order the pile gave them; the hand is sorted when it ends.
    handElement.replaceChildren(...(animateDeal ? bidding.dealt ?? bidding.hand : orderHandForDisplay(bidding.hand)).map(cardElement));
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
    if (retryOnNetworkError(error, () => { if (window.location.pathname === `/play/bot/bidding/${gameId}`) loadBidding(gameId); })) return;
    navigate("/play/bot", { replace: true });
  }
}

async function submitBid(action, body) {
  clearHint();
  const gameId = currentRouteId();
  if (onlineTable()) {
    onlineAction(gameId, { type: action, ...body });
    return;
  }
  const ui = auctionScreen();
  const biddingView = document.querySelector(ui.table).closest("[data-view]");
  biddingView.classList.add("auction-waiting-view");
  try {
    const humanName = document.querySelector(ui.bottom).dataset.playerName;
    showPlayerCall(ui.prefix, humanName, callLabel(action, body));
    await pause(ownCallDelay);
    const response = (await api.act(gameId, { type: action, ...body })).bidding;
    // Taking a trump or coinching ends the auction: the card table follows at once.
    // The server lists the calls by seat; the badge must follow them in speaking order, starting after the dealer.
    const speakingOrder = (response.calls ?? []).map((call, seat) => ({ call, seat }))
      .sort((left, right) => ((left.seat - response.dealerIndex + 3) % 4) - ((right.seat - response.dealerIndex + 3) % 4))
      .map(({ call }) => call);
    if (action !== "trump" && action !== "coinche") await revealCalls(ui.prefix, speakingOrder, humanName);
    if (action === "trump" || action === "coinche" || response.complete) {
      navigate(`/play/bot/game/${gameId}`);
      return;
    }
    reloadAuction(gameId);
  } catch (error) {
    // A refused call must not stay on the table: redraw the auction as the server holds it, badge included.
    // Only a server refusal leaves the table intact; on a network failure stay put and show the error.
    if (error.status) await reloadAuction(gameId);
    setTableStatus(error.message);
  } finally {
    biddingView.classList.remove("auction-waiting-view");
  }
}

// Creates a game from the setup sheet's choices and opens its bidding.
async function startGame(request) {
  const game = await api.createTable(request);
  navigate(`/play/bot/bidding/${game.tableId}`);
  return game;
}

// The setup sheet (US-118): one sheet for solo, pass-and-play and crew tables. The route opens it over its tab's page;
// the mode swaps the seat block and keeps the other choices.
const setupDialog = document.querySelector("#setup-sheet");
const setupForm = document.querySelector("#setup-form");
let setupMode = "solo";
let setupVariant = "CLASSIC";

function setupValues() {
  const form = new FormData(setupForm);
  return {
    variant: choiceValue("setup-variant"),
    difficulty: choiceValue("setup-difficulty"),
    announcements: choiceValue("setup-announcements") !== "off",
    allTrumps: choiceValue("setup-all-trumps") !== "off",
    target: Number(choiceValue("setup-target")),
    seats: ["north", "east", "south", "west"].map((seat) => form.get(seat) ?? ""),
    playerName: form.get("playerName")
  };
}

function fillSetup(setup) {
  setChoice("setup-variant", setup.variant);
  setupVariant = setup.variant;
  setChoice("setup-difficulty", setup.difficulty);
  setChoice("setup-announcements", setup.announcements ? "on" : "off");
  setChoice("setup-all-trumps", setup.allTrumps ? "on" : "off");
  setChoice("setup-target", setup.target);
}

function showSetupMode(mode) {
  setupMode = mode;
  setChoice("setup-mode", mode);
  const blocks = setupBlocks(mode, choiceValue("setup-variant"));
  document.querySelector("#setup-seats").hidden = !blocks.seats;
  document.querySelector("#setup-owner-block").hidden = !blocks.owner;
  document.querySelector("#setup-owner").required = blocks.owner;
  document.querySelector("#setup-bots").hidden = !blocks.bots;
  document.querySelector("#setup-rules").hidden = !blocks.rules;
  document.querySelector("#setup-all-trumps-field").hidden = !blocks.allTrumps;
  document.querySelector("#setup-submit").replaceChildren(t(submitLabel(mode)), " ", Object.assign(document.createElement("span"), { textContent: "→", ariaHidden: "true" }));
  document.querySelector("#setup-message").textContent = "";
}

// Opened from a route: that mode's remembered choices fill the sheet. Already open: only the mode changes. A sheet the
// player dismisses puts the address back on the page under it.
function openSetupSheet(mode) {
  if (sheets.isOpen(setupDialog)) {
    showSetupMode(mode);
    return;
  }
  fillSetup(loadSetup(window.localStorage, mode));
  showSetupMode(mode);
  openSetupDialog();
}

function openSetupDialog() {
  sheets.openSheet(setupDialog, {
    routed: false,
    onClose: (reason) => { if (reason === "closed") navigate(setupHome(setupMode), { replace: true }); }
  });
}

// The help sheet (US-123): the hint, the card order and the rules reference, one tap from the table. Its text is the
// rules view's, cloned when the sheet opens, so there is one copy of it to translate.
const helpDialog = document.querySelector("#help-sheet");

function helpHeading(source) {
  const heading = document.createElement("h3");
  heading.append(...source.childNodes);
  return heading;
}

function helpCopy(node) {
  const copy = node.cloneNode(true);
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((item) => item.removeAttribute("id"));
  [copy, ...copy.querySelectorAll("h2")].filter((item) => item.tagName === "H2").forEach((item) => item.replaceWith(helpHeading(item)));
  return copy;
}

function openHelpSheet({ opener = document.activeElement, routed = true, onClose = () => {} } = {}) {
  if (sheets.isOpen(helpDialog)) return;
  const rules = document.querySelector('[data-view="rules"]');
  const grid = rules.querySelector(".rules-grid");
  const order = grid.querySelector("#rules-card-order");
  document.querySelector("#help-card-order").replaceChildren(helpCopy(order));
  const rest = [...grid.children].filter((item) => item !== order);
  const variant = [...rules.children].slice([...rules.children].indexOf(grid) + 1).filter((item) => !item.matches("a.button"));
  document.querySelector("#help-rules").replaceChildren(...[...rest, ...variant].map(helpCopy));
  const hint = document.querySelector("#table-hint-button");
  document.querySelector("#help-hint").hidden = hint.hidden || document.querySelector("#table-bar").hidden;
  sheets.openSheet(helpDialog, { opener, routed, onClose });
}

document.querySelector("#table-help-button").addEventListener("click", () => {
  openHelpSheet({ opener: document.querySelector("#table-menu-toggle") });
});
document.querySelectorAll("[data-open-help]").forEach((button) => button.addEventListener("click", () => {
  openHelpSheet({ opener: button, routed: false, onClose: (reason) => { if (reason === "closed") openSetupDialog(); } });
}));
document.querySelector("#help-close").addEventListener("click", () => sheets.closeSheet(helpDialog));
document.querySelector("#help-hint").addEventListener("click", () => {
  sheets.closeSheet(helpDialog);
  document.querySelector("#table-hint-button").click();
});

choiceInputs("setup-mode").forEach((input) => input.addEventListener("change", () => {
  window.history.replaceState({}, "", setupPath(input.value));
  showSetupMode(input.value);
}));
choiceInputs("setup-variant").forEach((input) => input.addEventListener("change", () => {
  const variant = choiceValue("setup-variant");
  // A target still at the previous variant's default follows the new variant's default (US-130).
  if (Number(choiceValue("setup-target")) === defaultTarget(setupVariant)) setChoice("setup-target", defaultTarget(variant));
  setupVariant = variant;
  showSetupMode(setupMode);
}));
document.querySelector("#setup-close").addEventListener("click", () => sheets.closeSheet(setupDialog));

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = setupMode;
  const values = setupValues();
  const submit = document.querySelector("#setup-submit");
  document.querySelector("#setup-message").textContent = "";
  submit.disabled = true;
  try {
    const { variant, difficulty, announcements, allTrumps, target } = values;
    saveSetup(window.localStorage, mode, mode === "crew" ? { variant } : { variant, difficulty, announcements, allTrumps, target });
    if (mode === "crew") enterPrivateTable(await api.createTable(createRequest(mode, values)));
    else await startGame(createRequest(mode, values));
  } catch (error) {
    document.querySelector("#setup-message").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

// "Play now" opens the setup sheet (US-154), filled with the choices last made at a solo table or the defaults, so the
// player sees the game and the difficulty before the first card is dealt.
document.querySelector("#play-now").addEventListener("click", () => navigate("/play/bot"));

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

// The six boxes of the invitation code (US-124); the hidden field carries the code to the join handler.
const codeBoxes = [...Array(CODE_LENGTH)].map((_, index) => {
  const box = document.createElement("input");
  box.className = "code-box";
  box.type = "text";
  box.maxLength = CODE_LENGTH;
  box.required = true;
  box.autocomplete = "off";
  box.autocapitalize = "characters";
  box.inputMode = "text";
  box.setAttribute("aria-label", t("Character {0} of 6", index + 1));
  box.addEventListener("input", () => {
    const typed = normalizeCode(box.value);
    const next = spreadCode(codeBoxes.map((item) => item.value), index, typed);
    // A box holds one character: the rest of a paste goes to the boxes after it.
    codeBoxes.forEach((item, position) => { item.value = next[position]; });
    document.querySelector("#invitation-code").value = joinedCode(next);
    codeBoxes[typed ? Math.min(index + typed.length, CODE_LENGTH - 1) : index].focus();
  });
  box.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace") return;
    const values = codeBoxes.map((item) => item.value);
    const target = boxAfterBackspace(index, values);
    if (target !== index) {
      event.preventDefault();
      codeBoxes[target].focus();
    }
  });
  return box;
});
document.querySelector("#code-boxes").append(...codeBoxes);

// The online tables this tab still holds a seat at (US-124), checked against the server.
async function loadOpenTables() {
  const section = document.querySelector("#crew-open");
  section.hidden = true;
  const snapshots = (await Promise.all(Object.keys(tableTokens()).map((id) => api.table(id).catch(() => null))))
    .filter(Boolean);
  const open = openTables(snapshots);
  if (!open.length || viewForPath(window.location.pathname) !== "private") return;
  document.querySelector("#crew-open-list").replaceChildren(...open.map((item) => {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.className = "text-link";
    link.href = item.path;
    link.textContent = t("{0} · {1}", t(item.variantLabel), t(item.waiting ? "Waiting" : "Resume"));
    row.append(link);
    return row;
  }));
  section.hidden = false;
}

document.querySelector("#join-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    enterPrivateTable(await api.join(form.get("invitationCode"), form.get("playerName")));
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

// Watching a table (US-071): the invitation code, no seat; the owner must have allowed it.
document.querySelector("#watch-table-button").addEventListener("click", async () => {
  try {
    enterPrivateTable(await api.watch(document.querySelector("#invitation-code").value));
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
