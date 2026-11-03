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

// A belote or rebelote of the viewer's team that the board has just announced, or null. `message` is the
// board's declaration message ("Ann declares Belote."); `previousMessage` is the one seen before for the same
// game, undefined when this is the first, so reloading a game mid-round does not celebrate it again.
function momentForBelote({ message, previousMessage, seats, myTeam }) {
  if (myTeam !== 0 && myTeam !== 1) return null;
  if (!message || previousMessage === undefined || message === previousMessage) return null;
  const mine = myTeam === 0 ? NORTH_SOUTH : EAST_WEST;
  const declarer = seats
    .filter((seat) => message.startsWith(`${seat.name} declares`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (declarer?.team !== mine) return null;
  return message.includes("declares Rebelote") ? "rebelote" : "belote";
}

if (typeof module !== "undefined") module.exports = { MOMENTS, momentsForRound, momentForBelote };
