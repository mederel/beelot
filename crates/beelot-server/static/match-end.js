// The end-of-match screen (US-093): what it shows, from the match and the table's seats. The page draws it.
// `match` is the snapshot's `{ complete, winner, northSouth, eastWest, recap }`; `seats` is `board.seats`
// (`{ name, team }`); `myTeam` is 0 for North–South, 1 for East–West and null when the viewer sits in neither.

const MATCH_END_TEAMS = ["North–South", "East–West"];
const ANNOUNCEMENT_KINDS = ["tierce", "cinquante", "cent", "carre"];

// The model of the screen, or null when the match has not finished or carries no recap:
// `{ winner, iWon, podium, recap }`. `podium` is the winner then the other team, each
// `{ place, team, names, score }`; `recap.announcements` is North–South then East–West, each team's scored
// announcements as `{ kind, count }` without the zeros.
function matchEndModel({ match, seats, myTeam }) {
  if (!match?.complete || !match.winner || !match.recap) return null;
  const score = (team) => (team === MATCH_END_TEAMS[0] ? match.northSouth : match.eastWest);
  const names = (team) => seats.filter((seat) => seat.team === team).map((seat) => seat.name);
  const other = match.winner === MATCH_END_TEAMS[0] ? MATCH_END_TEAMS[1] : MATCH_END_TEAMS[0];
  const items = (counts) => ANNOUNCEMENT_KINDS
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, count: counts[kind] }));
  return {
    winner: match.winner,
    iWon: (myTeam === 0 || myTeam === 1) && MATCH_END_TEAMS[myTeam] === match.winner,
    podium: [match.winner, other].map((team, index) => ({
      place: index + 1,
      team,
      names: names(team),
      score: score(team),
    })),
    recap: {
      rounds: match.recap.rounds,
      biggestRound: match.recap.biggestRound ?? null,
      announcements: [
        { team: MATCH_END_TEAMS[0], items: items(match.recap.announcements.northSouth) },
        { team: MATCH_END_TEAMS[1], items: items(match.recap.announcements.eastWest) },
      ],
    },
  };
}

// The rematch proposal of an online table (US-114), seen by the seat `you`: `{ state, names }` where state is
// "idle" (nobody asked), "waiting" (I asked: `names` are the players still to answer) or "proposed" (others asked:
// `names` are those who did). `match.rematchVoted` and `match.rematchPending` are seat positions.
function rematchView(match, seats, you) {
  const voted = match?.rematchVoted ?? [];
  const named = (positions) => positions.map((position) => seats[position]?.name).filter(Boolean);
  if (voted.length === 0) return { state: "idle", names: [] };
  if (voted.includes(you)) return { state: "waiting", names: named(match.rematchPending ?? []) };
  return { state: "proposed", names: named(voted) };
}

// The texts of the primary button and of the status line under it for a rematch view.
function rematchTexts(view, translate) {
  const names = view.names.join(", ");
  if (view.state === "waiting") return { label: translate("Play again"), status: translate("Waiting for {0}…", names), disabled: true };
  if (view.state === "proposed") return { label: translate("Accept rematch"), status: translate("Rematch proposed by {0}", names), disabled: false };
  return { label: translate("Play again"), status: "", disabled: false };
}

// Shows a rematch view on the open screen; also called when the table changes while the screen stays open.
function showRematch(view) {
  const texts = rematchTexts(view, t);
  const button = matchEndElement("play-again");
  button.textContent = texts.label;
  button.disabled = texts.disabled;
  const status = matchEndElement("rematch");
  status.textContent = texts.status;
  status.hidden = texts.status === "";
}

const ANNOUNCEMENT_LABELS = { tierce: "tierce", cinquante: "cinquante", cent: "cent", carre: "carré" };

let matchEndOpener = null;
let matchEndKeyHandler = null;

// The confetti helper of celebrations.js: a global in the page, a require in the Node tests.
function matchEndConfetti(count) {
  const make = typeof confettiPieces === "function" ? confettiPieces : require("./celebrations.js").confettiPieces;
  return make(count);
}

function matchEndElement(id) {
  return document.querySelector(`#match-end-${id}`);
}

function matchEndText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// The lines of the recap card: rounds, the biggest round, then each team's scored announcements.
function recapLines(recap) {
  const number = (value) => (typeof formatNumber === "function" ? formatNumber(value) : String(value));
  const lines = [t("{0} rounds", recap.rounds)];
  if (recap.biggestRound) {
    const { points, team, round } = recap.biggestRound;
    lines.push(t("Biggest round: {0} points, {1}, round {2}", number(points), t(team), round));
  }
  lines.push(t("Announcements"));
  for (const { team, items } of recap.announcements) {
    const summary = items.length
      ? items.map(({ kind, count }) => `${t(ANNOUNCEMENT_LABELS[kind])} ×${count}`).join(", ")
      : t("None");
    lines.push(`${t(team)}: ${summary}`);
  }
  return lines;
}

// Opens the takeover for `model` (see matchEndModel). `animate` is false when the player comes back to a
// finished match, so the sticker and the confetti, which are for the winner, only play on the way in.
// `playAgain` runs from "Play again"; `onDismiss` from "View table" and Escape, which also close it.
function showMatchEnd(model, { animate = false, playAgain = () => {}, onDismiss = () => {} } = {}) {
  const overlay = document.querySelector("#match-end");
  const number = (value) => (typeof formatNumber === "function" ? formatNumber(value) : String(value));
  if (overlay.hidden) matchEndOpener = document.activeElement;

  matchEndElement("title").textContent = t("{0} win the match!", t(model.winner));
  // The first game and the first win (US-113) are celebrated like a victory, even after a defeat.
  const firsts = { firstWin: "First win!", firstGame: "First game!" };
  const first = animate ? firsts[model.goal?.celebration] : undefined;
  const celebrating = animate && (model.iWon || first !== undefined);
  const sticker = matchEndElement("sticker");
  sticker.textContent = celebrating ? t(first ?? "Victory!") : "";
  const goal = matchEndElement("goal");
  goal.textContent = model.goal?.message ?? "";
  goal.hidden = !model.goal;
  sticker.hidden = !celebrating;
  matchEndElement("confetti").replaceChildren(...(celebrating ? matchEndConfetti(14) : []));

  matchEndElement("podium").replaceChildren(...model.podium.map((step) => {
    const element = document.createElement("div");
    element.className = "podium-step";
    element.dataset.place = String(step.place);
    element.append(
      matchEndText("span", "podium-names", step.names.join(" · ")),
      matchEndText("strong", "podium-score", number(step.score)),
    );
    return element;
  }));
  matchEndElement("recap").replaceChildren(
    ...recapLines(model.recap).map((line, index) => matchEndText("p", index === 2 ? "recap-heading" : "recap-line", line)),
  );

  const dismiss = () => {
    onDismiss();
    hideMatchEnd();
  };
  matchEndElement("play-again").onclick = playAgain;
  matchEndElement("options").hidden = !model.solo;
  showRematch(model.rematch ?? { state: "idle", names: [] });
  matchEndElement("view-table").onclick = dismiss;
  if (matchEndKeyHandler) document.removeEventListener("keydown", matchEndKeyHandler);
  matchEndKeyHandler = (event) => {
    if (event.key === "Escape") dismiss();
  };
  document.addEventListener("keydown", matchEndKeyHandler);

  overlay.hidden = false;
  document.querySelector("main").inert = true;
  matchEndElement("play-again").focus();
}

// Closes the takeover: unlocks the table, empties the confetti, drops the Escape listener and gives the focus
// back to what had it. Safe to call when it is not open.
function hideMatchEnd() {
  const overlay = document.querySelector("#match-end");
  if (!overlay) return;
  overlay.hidden = true;
  const main = document.querySelector("main");
  if (main) main.inert = false;
  matchEndElement("confetti")?.replaceChildren();
  if (matchEndKeyHandler) {
    document.removeEventListener("keydown", matchEndKeyHandler);
    matchEndKeyHandler = null;
  }
  const opener = matchEndOpener;
  matchEndOpener = null;
  opener?.focus?.();
}

if (typeof module !== "undefined") module.exports = { matchEndModel, showMatchEnd, hideMatchEnd, rematchView, rematchTexts, showRematch };
