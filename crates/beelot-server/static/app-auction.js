// Calls, the opening deal, the auction views and starting a game.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
import { shownContract, showContractBadge, dealCards } from "./app-celebrations.js";
import { privateSessionKey, paced, firstDealSteps, viewForPath, onlineTable, currentRouteId, choiceInputs, choiceValue, setChoice, getPrivateSession, tableTokens, forgetTableSession, api, clearHint, renderView } from "./app-core.js";
import { setSuitText, orderHandForDisplay } from "./app-solo-table.js";
import { enterPrivateTable, setTableStatus, navigate, auctionScreens, loadAuction, onlineAction } from "./app-table-ui.js";
import { callsAfterOwn } from "./auction-sheet.js";
import { CODE_LENGTH, normalizeCode, spreadCode, boxAfterBackspace, joinedCode } from "./code-boxes.js";
import { callKind, contractAfterCall } from "./contract-badge.js";
import { t, localized, suitName, playerName } from "./i18n.js";
import { openTables } from "./progress-tabs.js";
import { isKnownRoute } from "./router.js";
import { defaultTarget, loadSetup, saveSetup, setupBlocks, createRequest, setupPath, setupHome, submitLabel } from "./setup-form.js";
import { sheets } from "./sheet.js";
import { playCallSound } from "./sounds.js";

function pause(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// The call a button sends, coded as the server codes the calls it answers with: the page shows the player's own call
// before the answer comes.
function callCodeOf(action, body = {}) {
  if (action === "pass") return { code: "call-pass", params: {} };
  if (action === "coinche") return { code: "call-coinche", params: {} };
  if (action === "contract") return { code: "call-bid", params: { value: String(body.value), trump: body.suit } };
  if (action === "trump") return { code: "call-trump", params: { trump: body.suit } };
  return null;
}

// The translated text of a call (its `callCode`); bubbles show its suit names as symbols (see setSuitText).
function callText(call) {
  return localized(call);
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
  if (kind === "coinche") return localized({ code: "auction-coinche", params: { name } });
  if (kind === "bid") return localized({ code: "auction-bid", params: { name, ...call.params } });
  return t("{0} takes with {1}.", playerName(name), suitName(call.params.trump, false));
}

async function announceCall(prefix, player, call) {
  const station = callStation(prefix, player, false);
  if (!station || !call) return;
  const already = station.querySelector(".player-call:not(.player-thinking)")?.dataset.call === callText(call);
  if (already) return;
  const message = document.querySelector(`#${prefix}-message`);
  if (message) message.textContent = localized({ code: "auction-deciding", params: { name: player } });
  const stopThinking = showThinking(station);
  await pause(paced("biddingThink"));
  stopThinking();
  if (showPlayerCall(prefix, player, call)) {
    if (message) setSuitText(message, callNarration(player, call));
    await pause(paced("biddingReveal"));
  }
}

async function revealCalls(prefix, calls, excludedPlayer = "") {
  for (const call of calls ?? []) {
    if (!call.callCode || call.playerName === excludedPlayer) continue;
    await announceCall(prefix, call.playerName, call.callCode);
  }
}

// Deals the opening cards, then shows the bids made by the players who speak before the human.
async function playOpeningDeal(game, bidding, humanIndex, ui = auctionScreens.table) {
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
    await pause(paced("ownCall"));
  }
  const bidOrder = (name) => (seatNames.indexOf(name) - bidding.dealerIndex - 1 + seatNames.length) % seatNames.length;
  const earlyCalls = bidding.calls.filter((call) => call.callCode && call.playerName !== seatNames[humanIndex])
    .sort((left, right) => bidOrder(left.playerName) - bidOrder(right.playerName));
  for (const call of earlyCalls) {
    await announceCall(ui.prefix, call.playerName, call.callCode);
  }
  controls.forEach((button, index) => { button.disabled = wasDisabled[index]; });
}

async function submitBid(action, body) {
  clearHint();
  const gameId = currentRouteId();
  if (onlineTable()) {
    // The sheet is hidden until the table is redrawn, so the other players' calls are what shows.
    document.querySelector("#auction-sheet").classList.add("call-sent");
    onlineAction(gameId, { type: action, ...body });
    return;
  }
  const ui = auctionScreens.table;
  const biddingView = document.querySelector(ui.table).closest("[data-view]");
  biddingView.classList.add("auction-waiting-view");
  try {
    const humanName = document.querySelector(ui.bottom).dataset.playerName;
    showPlayerCall(ui.prefix, humanName, callCodeOf(action, body));
    await pause(paced("ownCall"));
    const response = (await api.act(gameId, { type: action, ...body })).bidding;
    // Taking a trump or coinching ends the auction: the card table follows at once.
    // Only the calls made after the player's own are new, and they are shown in the order they were made, clockwise from
    // the player's left, never by seat.
    if (action !== "trump" && action !== "coinche") await revealCalls(ui.prefix, callsAfterOwn(response.auction, humanName), humanName);
    if (action === "trump" || action === "coinche" || response.complete) {
      navigate(`/play/bot/game/${gameId}`);
      return;
    }
    loadAuction(gameId);
  } catch (error) {
    // A refused call must not stay on the table: redraw the auction as the server holds it, badge included.
    // Only a server refusal leaves the table intact; on a network failure stay put and show the error.
    if (error.status) await loadAuction(gameId);
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

function setReactionsSeen(value) {
  reactionsSeen = value;
}

export { callText, pause, setupDialog, openSetupSheet, helpDialog, openHelpSheet, loadOpenTables, reactionsSeen, playOpeningDeal, submitBid, reactionLabels, setReactionsSeen };
