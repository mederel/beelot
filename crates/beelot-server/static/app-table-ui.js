// The table header and menu, status line, toasts, chips and the online lobby.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
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
const navigate = makeNavigate({ history: window.history, askToLeave: (destination) => askToLeave(destination), render: () => renderView(), beforeNavigate: () => sheets.closeAll() });

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

// The elements of a solo screen: the old view and the new table (US-119) show the same game, so one renderer serves both.
const soloScreens = {
  legacy: {
    prefix: "bot", table: "#bot-card-table", hand: "#card-hand", trick: "#current-trick", tricks: "#completed-tricks",
    result: "#round-result", contract: "#contract-result", breakdown: "#round-score-breakdown",
    next: "#next-round-button", rematch: "#rematch-button", results: "#results-button", review: "#review-button"
  },
  table: {
    prefix: "tbl", table: "#tbl-card-table", hand: "#tbl-hand", trick: "#tbl-current-trick", tricks: "#tbl-completed-tricks",
    result: "#tbl-round-result", contract: "#tbl-contract-result", breakdown: "#tbl-round-score-breakdown",
    next: "#tbl-next-round-button", rematch: "#tbl-rematch-button", results: "#tbl-results-button", review: "#tbl-review-button"
  }
};

function soloScreen() {
  return viewForPath(window.location.pathname) === "table" ? soloScreens.table : soloScreens.legacy;
}

function reloadSolo(gameId) {
  if (onlineTable()) return loadOnlineTable(gameId);
  return soloScreen() === soloScreens.table ? loadTable(gameId) : loadBotGame(gameId);
}

// The messages of the new table are toasts on the felt (US-119); the header keeps the turn status.
const tableToaster = makeToaster({
  show(text, kind) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    setSuitText(toast, text);
    document.querySelector("#tbl-toasts").replaceChildren(toast);
  },
  hide: () => document.querySelector("#tbl-toasts").replaceChildren(),
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (id) => window.clearTimeout(id)
});
// What the toasts announced last, so a render that repeats a declaration does not announce it again.
let toastedDeclaration = "";
let toastedDeclarers = "";

function resetTableToasts() {
  tableToaster.clear();
  toastedDeclaration = "";
  toastedDeclarers = "";
}

// The chip row (US-119): the declare switch and one chip per announcement; a tap on a chip shows its detail.
function renderChips(board) {
  const { declare, chips } = tableChips(board, {
    own: (own) => t("Declare: {0}", own.map(announcementName).join(", ")),
    name: announcementName,
    detail: (player, announcement) => `${playerName(player)}: ${announcementName(announcement)}`
  });
  const toggle = document.querySelector("#tbl-declare");
  // A new round switches the declaration on again.
  if (toggle.hidden && declare) toggle.setAttribute("aria-checked", "true");
  toggle.hidden = !declare;
  toggle.textContent = declare ? declare.label : "";
  const list = document.querySelector("#tbl-chip-list");
  list.replaceChildren(...chips.map((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.classList.toggle("scored", chip.scored);
    button.textContent = chip.text;
    button.addEventListener("click", () => tableToaster.push(chip.detail, "detail"));
    return button;
  }));
  document.querySelector("#tbl-chips").hidden = !declare && chips.length === 0;
}

document.querySelector("#tbl-declare").addEventListener("click", (event) => {
  const toggle = event.currentTarget;
  toggle.setAttribute("aria-checked", String(toggle.getAttribute("aria-checked") !== "true"));
});

// Whether the player's announcements are to be declared with the next card.
function soloDeclareChoice() {
  if (soloScreen() === soloScreens.legacy) return declareChoice("");
  const toggle = document.querySelector("#tbl-declare");
  return !toggle.hidden && toggle.getAttribute("aria-checked") === "true";
}

// The elements of an auction screen: the old bidding view and the card table with its sheet (US-120).
const auctionScreens = {
  legacy: {
    prefix: "bidding", table: "#bidding-card-table", bottom: "#bidding-player-bottom", hand: "#bidding-hand",
    upturned: "#upturned-card", controls: ".auction-dock button"
  },
  table: {
    prefix: "tbl", table: "#tbl-card-table", bottom: "#tbl-player-bottom", hand: "#tbl-hand",
    upturned: null, controls: "#auction-sheet button"
  }
};

function auctionScreen() {
  return onAuctionTable() ? auctionScreens.table : auctionScreens.legacy;
}

function reloadAuction(gameId) {
  return onAuctionTable() ? loadAuction(gameId) : loadBidding(gameId);
}

// The card table shows the sheet during the auction and its own widgets during the play.
function setAuctionPhase(auction) {
  document.querySelector("#auction-sheet").hidden = !auction;
  document.querySelector('[data-view="table"]').classList.toggle("auction-phase", auction);
}

let auctionTakeSuit = null;

// Draws the sheet from its model (US-120): the mode decides which choices exist, every disabled one gives a reason.
function renderAuctionSheet(bidding, game) {
  const $ = (selector) => document.querySelector(selector);
  const model = auctionSheet(bidding, { allTrumps: game.allTrumps, suit: choiceValue("auction-suit") });
  const isContree = bidding.variant === "CONTREE";
  setSuitText($("#auction-title"), model.titleSuit ? t(model.title, suitName(model.titleSuit)) : t(model.title));
  const history = $("#auction-history");
  history.hidden = model.history.length === 0;
  setSuitText(history, model.history.map((entry) => `${playerName(entry.playerName)}: ${callText(entry.call)}`).join(" · "));
  const upturned = $("#auction-upturned");
  upturned.hidden = model.mode !== "take" || !bidding.upturnedCard;
  upturned.replaceChildren(...(upturned.hidden ? [] : [cardElement(bidding.upturnedCard)]));
  const hand = $("#auction-hand");
  hand.setAttribute("aria-label", t(isContree ? "Your eight cards" : "Your five cards"));
  hand.replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));

  syncAuctionChoices("auction-value", (model.values ?? []).map((item) => ({ key: String(item.value), disabled: item.disabled })));
  $("#auction-values").hidden = !model.values;
  const bidSuits = model.mode === "bid" ? model.suits : [];
  syncAuctionChoices("auction-suit", bidSuits.map((item) => ({ key: item.suit, disabled: item.disabled })), true);
  $("#auction-suits").hidden = model.mode !== "bid";
  const trumps = $("#auction-trumps");
  trumps.hidden = model.mode !== "suit";
  trumps.querySelectorAll("button").forEach((button) => {
    button.disabled = Boolean(model.suits.find((item) => item.suit === button.dataset.suit)?.disabled ?? true);
  });

  const take = $("#auction-take");
  take.hidden = !model.take;
  auctionTakeSuit = model.take?.suit ?? null;
  if (model.take) {
    setSuitText(take, t("Take {0}", suitName(model.take.suit)));
    take.disabled = model.take.disabled;
  }
  const bid = $("#auction-bid");
  bid.hidden = !model.bid;
  bid.disabled = Boolean(model.bid?.disabled);
  updateAuctionBid();
  $("#auction-pass").disabled = model.pass.disabled;
  const coinche = $("#auction-coinche");
  coinche.hidden = !model.coinche.shown;
  coinche.disabled = model.coinche.disabled;
  for (const button of document.querySelectorAll("#auction-sheet .auction-actions button")) {
    button.setAttribute("aria-describedby", "auction-reason");
  }
  setSuitText($("#auction-reason"), auctionReason(model, bidding));
}

// Radio choices of the sheet: the model says which exist and which are disabled; one legal choice stays selected.
function syncAuctionChoices(name, items, hideMissing = false) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const inputs = choiceInputs(name);
  inputs.forEach((input) => {
    const item = byKey.get(input.value);
    input.disabled = !item || item.disabled;
    if (hideMissing) input.closest("label").hidden = !item;
  });
  if (!inputs.some((input) => input.checked && !input.disabled)) {
    const legal = inputs.find((input) => !input.disabled) ?? inputs.filter((input) => !input.closest("label").hidden).at(-1);
    if (legal) legal.checked = true;
  }
}

function updateAuctionBid() {
  const value = choiceValue("auction-value");
  const suit = choiceValue("auction-suit");
  if (value && suit) setSuitText(document.querySelector("#auction-bid"), t("Bid {0}", `${value} ${suitName(suit)}`));
}

// The one line that says why something is disabled, or else what passing means.
function auctionReason(model, bidding) {
  const say = (reason, value) => t(reason, typeof value === "string" ? playerName(value) : value);
  if (!model.enabled && model.pass.reason) return say(model.pass.reason, model.pass.reasonValue);
  if (model.bid?.reason) return say(model.bid.reason);
  const refused = model.suits.find((item) => item.reason);
  if (refused) return say(refused.reason);
  const low = (model.values ?? []).filter((item) => item.reason).at(-1);
  if (low) return say(low.reason, low.reasonValue);
  return t(passHelp({ variant: bidding.variant, round: bidding.round }));
}

for (const name of ["auction-value", "auction-suit"]) {
  choiceInputs(name).forEach((input) => input.addEventListener("change", updateAuctionBid));
}
document.querySelector("#auction-pass").addEventListener("click", () => submitBid("pass"));
document.querySelector("#auction-take").addEventListener("click", () => submitBid("trump", { suit: auctionTakeSuit }));
document.querySelector("#auction-bid").addEventListener("click", () => submitBid("contract", {
  value: Number(choiceValue("auction-value")),
  suit: choiceValue("auction-suit")
}));
document.querySelector("#auction-coinche").addEventListener("click", () => submitBid("coinche"));
document.querySelectorAll("#auction-trumps button").forEach((button) => {
  button.addEventListener("click", () => submitBid("trump", { suit: button.dataset.suit }));
});

// The auction on the card table (US-120): the same snapshot as the old bidding view, drawn on the table with its sheet.
async function loadAuction(gameId, known = null) {
  const ui = auctionScreens.table;
  const online = Boolean(known) || onlineTable();
  const shown = online ? tableShown : auctionShown;
  try {
    const snapshot = known ?? await api.table(gameId);
    const game = localGame(snapshot);
    const { bidding } = snapshot;
    announceGame(gameId, auctionView(bidding));
    leaveState = { kind: online ? "online" : "solo", matchComplete: false };
    if (!online) rememberSoloMatch(snapshot);
    showTableStatus({ phase: "bidding", complete: bidding.complete, myTurn: bidding.playerTurn,
      activeName: bidding.activePlayer, passAndPlay: game.passAndPlay });
    const isContree = bidding.variant === "CONTREE";
    document.querySelector("#tbl-title").textContent = t(game.variantLabel);
    document.querySelector("#table-menu-game").textContent = tableMenuTitle(snapshot.table, game);
    setAuctionPhase(true);
    resetTableToasts();
    document.querySelector("#tbl-chips").hidden = true;
    document.querySelector("#tbl-round-result").hidden = true;
    document.querySelector("#tbl-current-trick").replaceChildren();
    const currentPlayerIndex = bidding.currentPlayerIndex;
    const humanName = game.seats[currentPlayerIndex]?.name;
    const handedOff = handOff(game, humanName);
    const dealKey = `${gameId}:${bidding.dealerIndex}`;
    const animateDeal = !online && dealKey !== lastDealKey && !motionReduced()
      && !bidding.calls.some((call) => call.playerName === humanName && call.call);
    lastDealKey = dealKey;
    pendingSecondDeal = isContree || online ? null : { gameId, hand: bidding.hand, viewer: humanName };
    const sheet = document.querySelector("#auction-sheet");
    sheet.classList.toggle("dealing", animateDeal);
    const handElement = document.querySelector(ui.hand);
    handElement.replaceChildren(...orderHandForDisplay(bidding.hand).map(cardElement));
    layoutHand(handElement, bidding.hand.length);
    if (animateDeal) handElement.childNodes.forEach((card) => card.classList.add("undealt"));
    renderAuctionSheet(bidding, game);
    const seats = game.seats.map((seat, index) => ({
      name: seat.name,
      cardCount: animateDeal ? 0 : bidding.hand.length,
      active: seat.name === bidding.activePlayer,
      dealer: index === bidding.dealerIndex,
      team: index % 2 === 0 ? "North–South" : "East–West",
      call: animateDeal ? "" : bidding.calls.find((call) => call.playerName === seat.name)?.call ?? ""
    }));
    renderTableSeats(ui.prefix, seats, currentPlayerIndex < 0 ? 0 : currentPlayerIndex,
      // The opening reveal builds the badge call by call through showPlayerCall.
      animateDeal ? null : contractFromAuction(bidding.auction));
    botExpressionState.updateBidding(ui.prefix, seats, bidding);
    offerHint("#table-hint-button", gameId, !online && snapshot.table.hints && bidding.playerTurn && !bidding.complete);
    // In pass and play, "You" waits for the hand-off, so the bar does not tell who holds the device next.
    if (shown(gameId)) {
      showScoreBar(snapshot.match, null, game.passAndPlay ? null : currentPlayerIndex % 2);
    }
    await handedOff;
    if (shown(gameId)) showScoreBar(snapshot.match, null, currentPlayerIndex % 2);
    if (animateDeal) {
      await playOpeningDeal(game, bidding, currentPlayerIndex, ui);
      sheet.classList.remove("dealing");
    }
    // A bot took the contract before the player's first call: show its call, then the cards.
    if (bidding.complete && !online) {
      await pause(ownCallDelay);
      if (!auctionShown(gameId)) return;
      navigate(`/play/bot/game/${gameId}`);
    }
  } catch (error) {
    navigate(tableExitPath(), { replace: true });
  }
}

// ---- The online table (US-121): the lobby is a sheet over the empty felt; the cards and the auction are the same
// renderers as the solo table, fed with the snapshot the stream holds.

function tableMenuTitle(table, game) {
  if (!onlineTable()) return t("{0} · {1} bots", t(game.variantLabel), t(game.difficultyLabel));
  return `${t(table.publicTable ? "Public table" : "Private table")} · ${t(game.variantLabel)}`;
}

let onlineRequestId = 0;
let renderedOnline = { tableId: null, version: -1 };
let lobbyModelState = null;
let lobbyCountdown = null;

function lobbyMessage(text) {
  if (!document.querySelector("#lobby-sheet").hidden) document.querySelector("#lobby-message").textContent = text;
  else setTableStatus(text);
}

// One action at an online table, then the table as the server holds it.
async function onlineAction(tableId, action) {
  try {
    await api.act(tableId, action);
    await loadOnlineTable(tableId);
  } catch (error) {
    if (error.status) await loadOnlineTable(tableId, { fresh: true });
    lobbyMessage(error.message);
  }
}

function clearFelt() {
  setAuctionPhase(false);
  for (const id of ["tbl-player-top", "tbl-player-left", "tbl-player-right", "tbl-player-bottom", "tbl-hand", "tbl-current-trick"]) {
    document.querySelector(`#${id}`).replaceChildren();
  }
  document.querySelector("#tbl-round-result").hidden = true;
  document.querySelector("#tbl-chips").hidden = true;
  document.querySelector("#table-hint-button").hidden = true;
  resetTableToasts();
}

async function loadOnlineTable(tableId, { fresh = false } = {}) {
  const requestId = ++onlineRequestId;
  try {
    const snapshot = fresh ? await api.table(tableId) : await currentSnapshot(tableId);
    if (requestId !== onlineRequestId || !onlineTable() || currentRouteId() !== tableId) return;
    if (!fresh && renderedOnline.tableId === tableId && snapshot.version < renderedOnline.version) return;
    renderedOnline = { tableId, version: snapshot.version };
    openTableStream(tableId);
    const table = snapshot.table;
    const mine = table.seats.find((seat) => seat.you);
    const waiting = table.status === "WAITING_FOR_PLAYERS";
    leaveState = { kind: "online", matchComplete: Boolean(snapshot.match?.complete) };
    document.querySelector("#lobby-sheet").hidden = !waiting;
    document.querySelector('[data-view="table"]').classList.toggle("lobby-phase", waiting);
    if (waiting) {
      renderLobby(snapshot);
    } else {
      stopLobbyCountdown();
      if (snapshot.board) await renderSolo(tableId, soloScreens.table, snapshot);
      else if (snapshot.bidding) await loadAuction(tableId, snapshot);
    }
    if (requestId !== onlineRequestId) return;
    renderWatchers(table, !mine);
    const toggle = document.querySelector("#tbl-reactions-toggle");
    const reacting = !waiting && Boolean(mine) && reactionsEnabled();
    toggle.hidden = !reacting;
    if (!reacting) closeReactionTray(true);
    else if (wideScreen()) document.querySelector("#tbl-reaction-tray").hidden = false;
    if (!waiting) loadReactions(tableId, snapshot.reactions);
    if (mine && mine.connectionState !== "CONNECTED") {
      setTableStatus(t(mine.connectionState === "BOT_TAKEOVER" ? "Bot takeover" : "Disconnected"));
    }
  } catch (error) {
    if (requestId !== onlineRequestId) return;
    document.querySelector(tableHomePath() === "/online/public" ? "#public-form-message" : "#private-form-message").textContent =
      t("That table is no longer available.");
    navigate(tableHomePath(), { replace: true });
  }
}

// Spectators (US-071): seated players see how many are watching; a spectator is told that they only watch, and that the
// table's hands stay hidden.
function renderWatchers(table, spectating) {
  const line = document.querySelector("#tbl-watchers");
  const text = spectating ? t("You are watching this table.")
    : table.spectators > 0 ? t(table.spectators === 1 ? "{0} spectator is watching." : "{0} spectators are watching.", table.spectators) : "";
  line.textContent = text;
  line.hidden = text === "";
}

function lobbySeat(seat, tableId) {
  const item = document.createElement("div");
  item.className = `lobby-seat${seat.empty ? " lobby-seat-empty" : ""}${seat.you ? " lobby-seat-you" : ""}`;
  const team = document.createElement("small");
  team.className = "seat-team";
  team.textContent = t(seat.team);
  const name = document.createElement("strong");
  name.textContent = seat.empty ? t("Empty seat") : seat.you ? t("{0} (you)", playerName(seat.name)) : playerName(seat.name);
  item.append(team, name);
  if (seat.empty) {
    if (seat.canSit) {
      const sit = document.createElement("button");
      sit.className = "text-button";
      sit.type = "button";
      sit.textContent = t("Sit here");
      sit.setAttribute("aria-label", t("Sit in this {0} seat", t(seat.team)));
      sit.addEventListener("click", () => onlineAction(tableId, { type: "seat", position: seat.position }));
      item.append(sit);
    }
    return item;
  }
  const state = document.createElement("span");
  const connection = seat.connection === "bot" ? t("Bot takeover") : seat.connection === "disconnected" ? t("Disconnected") : t("Connected");
  state.textContent = seat.type === "BOT" ? t("Ready") : `${t(seat.ready ? "Ready" : "Waiting")} · ${connection}`;
  item.append(state);
  return item;
}

function renderLobby(snapshot) {
  const table = snapshot.table;
  const model = lobbyModel(table);
  lobbyModelState = model;
  const $ = (selector) => document.querySelector(selector);
  clearFelt();
  $("#tbl-title").textContent = t(table.variantLabel);
  $("#table-menu-game").textContent = tableMenuTitle(table, localGame(snapshot));
  setTableStatus(t(table.publicTable ? "Public table" : "Private table"));
  hideScoreBar();
  $("#lobby-title").textContent = t(model.title);
  $("#lobby-code-row").hidden = !model.showCode;
  $("#lobby-code").textContent = model.code;
  $("#lobby-share").hidden = !navigator.share;
  $("#lobby-seats").replaceChildren(...model.seats.map((seat) => lobbySeat(seat, table.id)));
  $("#lobby-ready").hidden = !model.ready.shown || table.publicTable;
  $("#lobby-ready").textContent = t(model.ready.on ? "Not ready" : "I am ready");
  $("#lobby-start").hidden = !model.start.shown;
  $("#lobby-start").disabled = model.start.disabled;
  $("#lobby-start-bots").hidden = !model.startWithBots.shown;
  $("#lobby-start-bots").disabled = model.startWithBots.disabled;
  $("#lobby-leave").hidden = !model.publicWaiting;
  $("#lobby-rules").hidden = !model.rules.shown;
  showLobbyFriends(model.rules.shown, table.id);
  setChoice("lobby-timer", model.rules.timer);
  setChoice("lobby-announcements", model.rules.announcements ? "on" : "off");
  setChoice("lobby-spectators", model.rules.spectators ? "on" : "off");
  $("#lobby-all-trumps-field").hidden = model.rules.allTrumps === null;
  setChoice("lobby-all-trumps", model.rules.allTrumps ? "on" : "off");
  setChoice("lobby-target", String(model.rules.target));
  const summary = [`${t("Variant: {0}", t(table.variantLabel))}.`];
  summary.push(model.summary.timer ? t("Turn timer: {0} seconds.", model.summary.timer) : t("Turn timer is disabled."));
  summary.push(t(model.summary.announcements ? "Announcements are on." : "Announcements are off."));
  if (model.summary.allTrumps !== null) summary.push(t(model.summary.allTrumps ? "Tout-atout and sans-atout are played." : "Only the four suits are played."));
  if (model.summary.spectators) summary.push(t("Spectators are allowed."));
  summary.push(t("The match is played to {0} points.", formatNumber(model.summary.target)));
  $("#lobby-summary").textContent = summary.join(" ");
  $("#lobby-message").textContent = "";
  const wait = $("#lobby-public-wait");
  wait.hidden = !model.publicWaiting;
  stopLobbyCountdown();
  if (model.publicWaiting && table.botFillAt) {
    const tick = () => {
      if (!onlineTable()) { stopLobbyCountdown(); return; }
      const secondsLeft = Math.max(0, Math.ceil((Date.parse(table.botFillAt) - Date.now()) / 1000));
      wait.textContent = t("Looking for players… bots take the empty seats in {0} s.", secondsLeft);
    };
    tick();
    lobbyCountdown = window.setInterval(tick, 1000);
  }
}
