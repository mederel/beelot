// What a screen reader is told as the game goes on (US-074): the difference between two renderings of a table,
// as structured events. No DOM, no translation: app-layout.js words them.

// The view of an auction: its calls in speaking order.
function auctionView(bidding) {
  return { kind: "auction", calls: (bidding.auction ?? []).map((entry) => ({ player: entry.playerName, call: entry.call })) };
}

// The view of the card play: the trick on the table with who played each card, its winner once it is complete.
function playView(board, match) {
  const seats = board.seats;
  const leader = (board.activePlayerIndex - board.currentTrick.length + seats.length) % seats.length;
  return {
    kind: "play",
    tricks: board.completedTricks,
    trick: board.currentTrick.map((card, index) => ({ player: seats[(leader + index) % seats.length].name, card })),
    winner: board.reviewingCompletedTrick ? board.trickWinner : null,
    round: board.roundResult ? { made: Boolean(board.roundResult.contractMade) } : null,
    matchWinner: match?.complete ? match.winner : null
  };
}

const sameCard = (a, b) => a.rank === b.rank && a.suit === b.suit;

function gameEvents(previous, next) {
  if (!previous || previous.kind !== next.kind) return [];
  if (next.kind === "auction") {
    const extends_ = previous.calls.length <= next.calls.length
      && previous.calls.every((entry, index) => entry.player === next.calls[index].player && entry.call === next.calls[index].call);
    return extends_ ? next.calls.slice(previous.calls.length).map((entry) => ({ type: "call", ...entry })) : [];
  }
  const events = [];
  const extension = previous.trick.length <= next.trick.length
    && previous.trick.every((entry, index) => entry.player === next.trick[index].player && sameCard(entry.card, next.trick[index].card));
  const fresh = extension ? next.trick.slice(previous.trick.length) : next.trick;
  fresh.forEach((entry) => events.push({ type: "card", player: entry.player, card: entry.card }));
  if (next.winner && (previous.winner !== next.winner || previous.tricks !== next.tricks)) events.push({ type: "trick", winner: next.winner });
  if (next.round && !previous.round) events.push({ type: "round", made: next.round.made });
  if (next.matchWinner && !previous.matchWinner) events.push({ type: "match", winner: next.matchWinner });
  return events;
}

if (typeof module !== "undefined") module.exports = { auctionView, playView, gameEvents };
