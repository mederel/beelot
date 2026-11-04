// Celebrates the big moments of a round (US-090): which moment a round end or a belote is, and the sticker
// that shows it. Only the viewer's team is celebrated; `myTeam` is 0 for North–South, 1 for East–West and
// null when the viewer sits in neither.

const NORTH_SOUTH = "North–South";
const EAST_WEST = "East–West";

// Each moment's sticker text, confetti effect and sound (a key of the `sounds` table of sounds.js).
const MOMENTS = {
  matchWin: { text: "Victory!", effect: "large-confetti", sound: "matchWin" },
  capot: { text: "Capot!", effect: "confetti", sound: "capot" },
  coincheWon: { text: "Coinche!", effect: "stars", sound: "coincheWon" },
  defended: { text: "Down!", effect: "confetti", sound: "defended" },
  roundWon: { text: "Round won!", effect: "light-confetti", sound: "roundWin" },
  contractLost: { text: "Down!", effect: "none", sound: "contractLost" },
  belote: { text: "Belote!", effect: "none", sound: "belote" },
  rebelote: { text: "Rebelote!", effect: "none", sound: "belote" },
};

const ROUND_PRIORITY = ["matchWin", "capot", "coincheWon", "defended", "roundWon"];
const CAPOT_POINTS = 250;

// Reads a round end into `{ sticker, chips }`: the highest-priority moment of the viewer's team as the sticker
// and the others as chips (`{ kind, text }`). Null when nothing is worth celebrating. A contract the viewer's
// team failed is the only sticker, with at most the belote chip.
function momentsForRound({ round, board, match, myTeam }) {
  if (myTeam !== 0 && myTeam !== 1) return null;
  const mine = myTeam === 0 ? NORTH_SOUTH : EAST_WEST;
  const ours = myTeam === 0 ? round.northSouthAwarded : round.eastWestAwarded;
  const theirs = myTeam === 0 ? round.eastWestAwarded : round.northSouthAwarded;
  const beloteBonus = myTeam === 0 ? round.northSouthBeloteBonus : round.eastWestBeloteBonus;
  const declaringMine = board.declaringTeam === mine;
  const beloteChip = beloteBonus > 0 ? [{ kind: "belote", text: "Belote ✓" }] : [];

  // A lost match gets no sticker, whatever the last round was.
  if (match?.complete && match.winner !== mine) return null;

  if (declaringMine && !round.contractMade) return { sticker: "contractLost", chips: beloteChip };

  const applies = {
    matchWin: Boolean(match?.complete) && match.winner === mine,
    capot: round.capotTeam === mine,
    coincheWon: Boolean(board.coinched) && (declaringMine ? round.contractMade : !round.contractMade),
    defended: !declaringMine && !round.contractMade && !board.coinched,
    roundWon: ours >= theirs,
  };
  const [sticker, ...rest] = ROUND_PRIORITY.filter((kind) => applies[kind]);
  if (sticker === undefined) return null;

  const chips = rest.map((kind) => ({ kind, text: MOMENTS[kind].text }));
  if (applies.capot) {
    const bid = board.variant === "CONTREE" && declaringMine ? board.contractValue : 0;
    chips.push({ kind: "points", text: `+${CAPOT_POINTS + bid}` });
  }
  return { sticker, chips: [...chips, ...beloteChip] };
}

// The belote or rebelote a declaration message announces, as `{ kind, team }`, or null. The message names the
// player ("Ann declares Belote."), so the team is that of the seat whose name followed by " declares" starts it;
// the longest matching name wins, so "Al" and "Alex" do not clash.
function beloteDeclaration(message, seats) {
  if (!message) return null;
  const declarer = seats
    .filter((seat) => message.startsWith(`${seat.name} declares`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!declarer) return null;
  return { kind: message.includes("declares Rebelote") ? "rebelote" : "belote", team: declarer.team };
}

// A belote or rebelote of the viewer's team that the board has just announced, or null. `previousMessage` is the
// message seen before for the same game, undefined when this is the first, so reloading a game mid-round does
// not celebrate it again.
function momentForBelote({ message, previousMessage, seats, myTeam }) {
  if (myTeam !== 0 && myTeam !== 1) return null;
  if (previousMessage === undefined || message === previousMessage) return null;
  const declaration = beloteDeclaration(message, seats);
  return declaration?.team === (myTeam === 0 ? NORTH_SOUTH : EAST_WEST) ? declaration.kind : null;
}

// Follows one game's declaration messages. `watch({ message, seats, myTeam })` returns the belote or rebelote to
// celebrate now, or null. The first message seen is ignored (a reload mid-round). A declaration is remembered
// until a viewer of the declaring team looks, so in pass-and-play, where the device moves to the other team right
// after the card is played, the declarer's team still sees it on their turn; a new or empty message drops it.
function createBeloteWatcher() {
  let seen = false;
  let last = "";
  let pending = null;
  return {
    watch({ message, seats, myTeam }) {
      if (!seen) {
        seen = true;
        last = message;
        return null;
      }
      if (message !== last) {
        last = message;
        pending = beloteDeclaration(message, seats);
      }
      if (pending && (myTeam === 0 || myTeam === 1) && pending.team === (myTeam === 0 ? NORTH_SOUTH : EAST_WEST)) {
        const { kind } = pending;
        pending = null;
        return kind;
      }
      return null;
    },
  };
}

const CELEBRATION_MS = 1800;
const CONFETTI_PIECES = 14;
const CONFETTI_COLOURS = ["var(--gold)", "var(--pink)", "var(--aqua)", "var(--violet)", "var(--red)"];

// `count` confetti pieces (`<i>`), each styled by custom properties (`--x`, `--r`, `--delay`, `--colour`) that the
// stylesheet animates. The offsets and colours are fixed by the index, so the same moment always looks the same.
function confettiPieces(count = CONFETTI_PIECES) {
  return Array.from({ length: count }, (_, index) => {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${(index % 7 - 3) * 34}px`);
    piece.style.setProperty("--r", `${(index * 47) % 360}deg`);
    piece.style.setProperty("--delay", `${(index % 5) * 60}ms`);
    piece.style.setProperty("--colour", CONFETTI_COLOURS[index % CONFETTI_COLOURS.length]);
    return piece;
  });
}

// Shows the sticker of `kind` (a key of MOMENTS) with its chips over `table` (a `.card-table`), plays its sound
// and removes it after 1.8 s, replacing a celebration still showing. Returns the element, or null for an unknown
// kind. The confetti pieces take fixed offsets and colours, so the same moment always looks the same.
function celebrate(table, kind, chips = []) {
  const moment = MOMENTS[kind];
  if (!moment) return null;
  table.querySelectorAll(".celebration").forEach((showing) => showing.remove());

  const element = document.createElement("div");
  element.className = "celebration";
  element.setAttribute("aria-hidden", "true");
  element.dataset.kind = kind;
  element.dataset.effect = moment.effect;

  const sticker = document.createElement("div");
  sticker.className = "celebration-sticker";
  sticker.textContent = t(moment.text);

  const list = document.createElement("div");
  list.className = "celebration-chips";
  list.append(...chips.map((chip) => {
    const item = document.createElement("span");
    item.className = "celebration-chip";
    item.dataset.kind = chip.kind;
    item.textContent = chip.kind === "points" ? chip.text : t(chip.text);
    return item;
  }));

  const confetti = moment.effect === "none" ? [] : confettiPieces(CONFETTI_PIECES);

  element.append(sticker, list, ...confetti);
  table.append(element);
  playSound(moment.sound);
  window.setTimeout(() => element.remove(), CELEBRATION_MS);
  return element;
}

if (typeof module !== "undefined") module.exports = { MOMENTS, momentsForRound, momentForBelote, createBeloteWatcher, celebrate, confettiPieces };
