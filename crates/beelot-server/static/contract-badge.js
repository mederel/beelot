// Tracks the current contract (who holds it, its value, trump and coinche) from the calls of an auction
// or from a board, so the page can show a badge at the bidder's seat.
// A contract is `{ player, value, suit, coinched }`; `value` is null when trump was chosen without a bid.
// A call is the `callCode` the server sends, `{ code, params }` (US-170); the English `call` is not read.

const CALL_KINDS = { "call-pass": "pass", "call-coinche": "coinche", "call-bid": "bid", "call-trump": "trump" };

// What a call is: "pass", "coinche", "bid" or "trump" (the suit chosen after the upturned card); null for no call.
function callKind(call) {
  return CALL_KINDS[call?.code] ?? null;
}

// Two calls are the same call when their keys are equal.
function callKey(call) {
  return call ? `${call.code}|${call.params?.value ?? ""}|${call.params?.trump ?? ""}` : "";
}

// Applies one call to the contract and returns the new contract.
function contractAfterCall(contract, player, call) {
  switch (callKind(call)) {
    case "coinche": return contract ? { ...contract, coinched: true } : contract;
    case "bid": return { player, value: Number(call.params.value), suit: call.params.trump, coinched: false };
    case "trump": return { player, value: null, suit: call.params.trump, coinched: false };
    default: return contract;
  }
}

// Folds the calls of an auction, in order, into the contract they leave.
function contractFromAuction(calls) {
  return calls.reduce((contract, { playerName, callCode }) => contractAfterCall(contract, playerName, callCode), null);
}

// Reads the contract of a board, or null when no one has declared.
function contractFromBoard(board) {
  const index = board.declaringPlayerIndex;
  if (index == null || index < 0) return null;
  return {
    player: board.seats[index].name,
    value: board.variant === "CONTREE" ? board.contractValue : null,
    suit: board.trump,
    coinched: Boolean(board.coinched),
  };
}

export { callKind, callKey, contractAfterCall, contractFromAuction, contractFromBoard };
