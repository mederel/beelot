// Derives the bot characters' reactions from the game: the events that happened between two boards
// and the expression each bot seat takes after them. Seat indexes are absolute (the board's `seats`
// order), so a pass-and-play viewer change does not move or trigger anything.
// `botEvents` reports `{ type: "trick", seat, big }`, `{ type: "round", team, contractMade, capot }`
// and `{ type: "match", team }`, in that order.
// Coinche events are supplied by the caller (the board only exists after the auction, so it cannot
// see a coinche happen): `{ type: "coinche", team: <the coinching (defending) team's name>,
// seat?: <the coincher's absolute seat index> }`. The declaring team's bots are annoyed; the coincher
// is pleased, or both bots of the coinching team when `seat` is missing.

const BIG_TRICK_POINTS = 20;

// True when both boards belong to the same round: same dealer, no trick count going back and no
// round result cleared.
function sameRound(previous, board) {
  return previous.dealerIndex === board.dealerIndex
    && board.completedTricks >= previous.completedTricks
    && !(previous.roundResult && !board.roundResult);
}

function teamOf(board, seat) {
  return board.seats[seat]?.team;
}

// The events between `previous` and `board`, in order: trick, round, match.
// No previous board (first load or reload) gives none. Across a new round only the round result
// (and the match end that comes with it) is reported.
function botEvents(previous, board, match) {
  if (previous == null || board == null) return [];
  const events = [];
  const continuing = sameRound(previous, board);
  if (continuing) {
    const newTrick = !previous.reviewingCompletedTrick || previous.completedTricks !== board.completedTricks;
    if (board.reviewingCompletedTrick && newTrick) {
      // The winner is given by name: duplicate names resolve to the first seat.
      const seat = board.seats.findIndex((s) => s.name === board.trickWinner);
      if (seat !== -1) events.push({ type: "trick", seat, big: board.trickPoints >= BIG_TRICK_POINTS });
    }
  }
  const result = board.roundResult;
  if (result && (!continuing || !previous.roundResult)) {
    events.push({
      type: "round",
      team: teamOf(board, board.declaringPlayerIndex),
      contractMade: Boolean(result.contractMade),
      capot: Boolean(result.capotTeam),
    });
    // A match ends only with a round result, so `match` is reported together with `round`.
    if (match?.complete && match.winner) events.push({ type: "match", team: match.winner });
  }
  return events;
}

// The expression of each bot seat after `events`, as `{ [seatIndex]: expression }`; a later event
// replaces an earlier one. `isBot(name)` tells the bot seats; humans never appear.
function expressionsFor(events, board, isBot) {
  const expressions = {};
  const seats = board?.seats ?? [];
  const set = (seat, expression) => {
    if (seats[seat] && isBot(seats[seat].name)) expressions[seat] = expression;
  };
  const eachSeat = (fn) => seats.forEach((seat, index) => fn(seat.team, index));
  for (const event of events) {
    if (event.type === "trick") {
      const winners = teamOf(board, event.seat);
      eachSeat((team, index) => {
        if (index === event.seat) set(index, event.big ? "celebrating" : "pleased");
        else if (team === winners) set(index, "pleased");
        else if (event.big) set(index, "annoyed");
      });
    } else if (event.type === "coinche") {
      eachSeat((team, index) => {
        if (team !== event.team) set(index, "annoyed");
        else if (event.seat == null || index === event.seat) set(index, "pleased");
      });
    } else if (event.type === "round") {
      const winnersAreDeclarers = event.contractMade;
      eachSeat((team, index) => {
        const won = (team === event.team) === winnersAreDeclarers;
        set(index, won ? (event.capot ? "celebrating" : "pleased") : "annoyed");
      });
    } else if (event.type === "match") {
      eachSeat((team, index) => set(index, team === event.team ? "celebrating" : "annoyed"));
    }
  }
  return expressions;
}

// True while the seat is the active player and nothing is being reviewed or scored.
function isThinking(board, seatIndex) {
  return board != null
    && board.activePlayerIndex === seatIndex
    && !board.reviewingCompletedTrick
    && !board.roundResult;
}

if (typeof module !== "undefined") module.exports = { botEvents, expressionsFor, isThinking };
