// The live region of the game (US-074): bids, cards played, the trick's winner and the end of a round or a match are
// spoken as they happen. The first rendering of a table says nothing, so opening a game mid-way is not a flood.
const liveViews = new Map();

function describeGameEvent(event) {
  if (event.type === "call") return t("{0}: {1}", playerName(event.player), callText(event.call));
  if (event.type === "card") return t("{0} played {1}.", playerName(event.player), cardName(event.card));
  if (event.type === "trick") return t("{0} wins the trick.", playerName(event.winner));
  if (event.type === "round") return `${t(event.made ? "Contract made" : "Contract failed")}.`;
  return t("{0} win the match!", t(event.winner));
}

function announceGame(tableId, view) {
  const events = gameEvents(liveViews.get(tableId) ?? null, view);
  liveViews.set(tableId, view);
  if (events.length) document.querySelector("#game-live").textContent = events.map(describeGameEvent).join(" ");
}

document.querySelector("#skip-link").addEventListener("click", () => document.querySelector("main").focus());
