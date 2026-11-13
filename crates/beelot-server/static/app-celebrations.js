// Round and match celebrations, goals and the end-of-match screen.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).
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
// A solo game also asks the server which of the player's cards cost points (US-067); `analysisFor` fetches it.
function openRoundReview(board, round, analysisFor = null) {
  showRoundReview({ review: round.review, seats: board.seats, currentPlayerIndex: board.currentPlayerIndex, loadAnalysis: analysisFor });
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
  if (goals) refreshThemeUnlocks();
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
  ], { duration: paced("dealFlight"), easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  return flight.finished.then(() => packet.remove(), () => packet.remove());
}

/**
 * Animates cards being dealt. Each step deals `sizes[seatIndex]` cards to every seat, starting with the seat
 * to the dealer's left. A step may come from the table centre (the upturned card) instead of the dealer.
 */
async function dealCards({ prefix, seatNames, dealerIndex, steps, handElement, startCount, sortedKeys, restyle }) {
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
      await pause(paced("dealGap"));
    }
  }
  // The human's cards arrived in the order of the pile; now they arrange their hand (US-140).
  if (sortedKeys) {
    await pause(paced("dealGap"));
    await sortHandAnimated(handElement, sortedKeys, restyle);
  }
  handElement.classList.remove("dealing");
}

/**
 * Puts the cards of a hand in the order of `orderedKeys` (keys such as "J-HEARTS"), each card sliding from where it was
 * to its new place. `restyle(card, index, count)` sets what depends on a card's place, such as its place in the fan.
 * Without animation support or with reduced motion the cards simply take their places.
 */
function sortHandAnimated(handElement, orderedKeys, restyle) {
  const cards = [...handElement.children];
  const byKey = new Map(cards.map((card) => [card.dataset.card, card]));
  const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
  const sorted = orderedKeys.map((key) => byKey.get(key)).filter(Boolean);
  if (sorted.length !== cards.length) return Promise.resolve();
  handElement.replaceChildren(...sorted);
  sorted.forEach((card, index) => restyle?.(card, index, sorted.length));
  if (motionReduced()) return Promise.resolve();
  const slides = sorted.map((card) => {
    const from = before.get(card);
    const to = card.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if ((!dx && !dy) || typeof card.animate !== "function") return null;
    return card.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }],
      { duration: 420, easing: "cubic-bezier(.2, .8, .2, 1)" }).finished.catch(() => {});
  });
  return Promise.all(slides);
}
