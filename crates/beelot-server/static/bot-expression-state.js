const BOT_EXPRESSION_MS = 2500;

// Keeps expressions with their absolute seat rather than with the SVG that a table redraw replaces.
function createBotExpressionState({
  isBot, setExpression, botEvents, expressionsFor, isThinking, onEvents = () => {}, setTimer = setTimeout, clearTimer = clearTimeout
}) {
  let gameId = null;
  let prefix = "";
  let currentSeats = [];
  let previousBoard = null;
  let thinkingBoard = null;
  let auction = null;
  let greeted = false;
  const seatStates = new Map();

  function stopTimer(state) {
    if (state.timerHandle !== null) clearTimer(state.timerHandle);
    state.timer = null;
    state.timerHandle = null;
  }

  function expressionAt(seatIndex, expression, force = false) {
    const state = seatStates.get(seatIndex);
    if (!state || !isBot(state.name)) return;
    const changed = state.expression !== expression;
    state.expression = expression;
    if (changed || force) setExpression(prefix, seatIndex, expression);
  }

  function syncThinking() {
    for (const [seatIndex, state] of seatStates) {
      if (state.timer) continue;
      const expression = thinkingBoard && isThinking(thinkingBoard, seatIndex) ? "thinking" : "neutral";
      expressionAt(seatIndex, expression);
    }
  }

  function showTransient(seatIndex, expression) {
    const state = seatStates.get(seatIndex);
    if (!state || !isBot(state.name)) return;
    stopTimer(state);
    expressionAt(seatIndex, expression);
    const timer = {};
    const expectedGame = gameId;
    const expectedName = state.name;
    state.timer = timer;
    state.timerHandle = setTimer(() => {
      if (gameId !== expectedGame || seatStates.get(seatIndex) !== state
        || state.name !== expectedName || state.timer !== timer) return;
      state.timer = null;
      state.timerHandle = null;
      const next = thinkingBoard && isThinking(thinkingBoard, seatIndex) ? "thinking" : "neutral";
      expressionAt(seatIndex, next);
    }, BOT_EXPRESSION_MS);
  }

  function applyEvents(events, board) {
    const expressions = expressionsFor(events, board, isBot);
    for (const [seat, expression] of Object.entries(expressions)) showTransient(Number(seat), expression);
  }

  function teamAt(seatIndex) {
    return currentSeats[seatIndex]?.team ?? (seatIndex % 2 === 0 ? "North–South" : "East–West");
  }

  function coincheFromAuction(bidding) {
    const calls = bidding.auction ?? bidding.calls ?? [];
    const call = calls.find((item) => /^coinche/i.test(item.call ?? ""));
    if (!call) return null;
    const seat = currentSeats.findIndex((item) => item.name === call.playerName);
    return seat < 0 ? null : { type: "coinche", team: teamAt(seat), seat };
  }

  function updateSeats(nextPrefix, seats) {
    prefix = nextPrefix;
    currentSeats = seats.map((seat, index) => ({
      ...seat,
      team: seat.team ?? (index % 2 === 0 ? "North–South" : "East–West")
    }));
    const liveSeats = new Set();
    currentSeats.forEach((seat, seatIndex) => {
      liveSeats.add(seatIndex);
      const previous = seatStates.get(seatIndex);
      if (previous && previous.name !== seat.name) {
        stopTimer(previous);
        seatStates.delete(seatIndex);
      }
      if (!isBot(seat.name)) return;
      let state = seatStates.get(seatIndex);
      if (!state) {
        state = { name: seat.name, expression: "neutral", timer: null, timerHandle: null };
        seatStates.set(seatIndex, state);
      }
      setExpression(prefix, seatIndex, state.expression);
    });
    for (const [seatIndex, state] of seatStates) {
      if (!liveSeats.has(seatIndex)) {
        stopTimer(state);
        seatStates.delete(seatIndex);
      }
    }
    if (thinkingBoard) thinkingBoard = { ...thinkingBoard, seats: currentSeats };
    syncThinking();
  }

  function reset(nextGameId = "") {
    if (gameId === nextGameId) return;
    for (const state of seatStates.values()) stopTimer(state);
    seatStates.clear();
    gameId = nextGameId;
    prefix = "";
    currentSeats = [];
    previousBoard = null;
    thinkingBoard = null;
    auction = null;
    greeted = false;
  }

  // The greeting is for the very first snapshot of a game, and only when that snapshot is the start of
  // the match (first auction or first trick, scores 0-0). Anything later never greets.
  function greetingEvent(startsRound, match, viewer) {
    if (greeted) return null;
    greeted = true;
    const scoreless = !match || (match.northSouth === 0 && match.eastWest === 0);
    return startsRound && scoreless ? { type: "greeting", viewer } : null;
  }

  function updateBidding(nextPrefix, seats, bidding, match = null) {
    updateSeats(nextPrefix, seats);
    if (!bidding) return [];
    const key = bidding.auctionId ?? `${bidding.dealerIndex}:${bidding.round}`;
    const coinche = coincheFromAuction(bidding);
    let events = [];
    if (!auction || auction.key !== key) {
      const hadAuction = auction !== null;
      auction = { key, dealerIndex: bidding.dealerIndex, coinched: false };
      if (hadAuction && coinche) events = [coinche];
    } else if (!auction.coinched && coinche) {
      events = [coinche];
    }
    if (coinche) auction.coinched = true;
    const greeting = greetingEvent(bidding.round === 1, match, bidding.currentPlayerIndex);
    if (greeting) events = [greeting, ...events];
    const activePlayerIndex = bidding.complete ? -1 : currentSeats.findIndex((seat) => seat.name === bidding.activePlayer);
    thinkingBoard = {
      seats: currentSeats,
      activePlayerIndex,
      reviewingCompletedTrick: false,
      roundResult: null
    };
    if (events.length) {
      applyEvents(events, thinkingBoard);
      onEvents(prefix, events, currentSeats);
    }
    syncThinking();
    return events;
  }

  function updateBoard(nextPrefix, board, match) {
    updateSeats(nextPrefix, board.seats);
    const previous = previousBoard;
    const events = [];
    const greeting = greetingEvent(board.completedTricks === 0 && !board.roundResult, match, board.currentPlayerIndex);
    if (greeting) events.push(greeting);
    const sameRound = previous && previous.dealerIndex === board.dealerIndex
      && board.completedTricks >= previous.completedTricks
      && !(previous.roundResult && !board.roundResult);
    if (sameRound && !previous.coinched && board.coinched) {
      const auctionAlreadyReported = auction?.dealerIndex === board.dealerIndex && auction.coinched;
      if (!auctionAlreadyReported) {
        const declaringTeam = board.declaringTeam ?? teamAt(board.declaringPlayerIndex);
        if (declaringTeam) {
          const team = declaringTeam === "North–South" ? "East–West" : "North–South";
          events.push({ type: "coinche", team });
        }
      }
      if (auction?.dealerIndex === board.dealerIndex) auction.coinched = true;
    }
    events.push(...botEvents(previous, board, match));
    previousBoard = board;
    thinkingBoard = board;
    if (events.length) {
      applyEvents(events, board);
      onEvents(prefix, events, currentSeats);
    }
    syncThinking();
    return events;
  }

  return { reset, setSeats: updateSeats, updateBidding, updateBoard };
}

if (typeof module !== "undefined") module.exports = { createBotExpressionState, BOT_EXPRESSION_MS };