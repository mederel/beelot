// The bots' in-character lines: a fixed catalogue (two English lines per character and kind, which are
// also the keys passed to `t()`) and the choice of the one line a round may get. Lines are plain
// texts: they contain nothing about cards, suits or hands, so a bot cannot reveal its hand.
// Kinds: greeting (said once at the start of a game), coincheMade, coincheReceived, contractMade, contractFailed, capot, bigTrick, matchWon, matchLost.

const BOT_LINES = {
  camille: {
    coincheMade: [
      "Coinche! Nothing personal, friends.",
      "Sorry! I just have a good feeling.",
    ],
    coincheReceived: [
      "Oh, bold! I like the spirit.",
      "Coinched? We can handle this!",
    ],
    contractMade: [
      "We did it! Lovely teamwork.",
      "That went beautifully, thank you!",
    ],
    contractFailed: [
      "Oh well, we'll get the next one!",
      "No worries, that one was tough.",
    ],
    capot: [
      "Every single trick! Wow!",
      "Did we really win them all?!",
    ],
    bigTrick: [
      "What a lovely trick!",
      "That one felt really good!",
    ],
    matchWon: [
      "We won! Great game, everyone!",
      "Thank you all, that was so fun!",
    ],
    matchLost: [
      "Well played, you earned it!",
      "Congratulations! Rematch soon?",
    ],
    greeting: [
      "Hello, friends! Let's have fun!",
      "Welcome! Good luck, everyone!",
    ],
  },
  luc: {
    coincheMade: [
      "Coinche! Let's make it exciting.",
      "Coinche! This is gonna be fun.",
    ],
    coincheReceived: [
      "Coinche? Ha, I love the drama!",
      "Coinched? Okay, now it's a game!",
    ],
    contractMade: [
      "Easy. I barely looked.",
      "Called it! I'm so good.",
    ],
    contractFailed: [
      "That was on purpose. Obviously.",
      "Okay, the cards hated me.",
    ],
    capot: [
      "Every trick! Say it, I'm great.",
      "Capot! Somebody call the news.",
    ],
    bigTrick: [
      "Boom! Did you see that?",
      "Ha! That one was smooth.",
    ],
    matchWon: [
      "Winner winner, belote dinner!",
      "We won! I'm telling everyone.",
    ],
    matchLost: [
      "Fine, that was a good one.",
      "Great game! Rematch?",
    ],
    greeting: [
      "Hey there! Let's make it fun.",
      "Hey! Ready for a good game?",
    ],
  },
  manon: {
    coincheMade: [
      "Coinche. I never bluff.",
      "Coinche! You know I'm right.",
    ],
    coincheReceived: [
      "Coinched? Fine. I'm ready.",
      "Bring it on. I'm ready.",
    ],
    contractMade: [
      "Exactly as planned.",
      "Never in doubt. Next.",
    ],
    contractFailed: [
      "A bad round. Not again.",
      "Remember this. I'll win it back.",
    ],
    capot: [
      "Total domination. Obviously.",
      "Every trick. What a round.",
    ],
    bigTrick: [
      "That's how it's done.",
      "Too easy. Who's next?",
    ],
    matchWon: [
      "Champions, as expected.",
      "Another win. I'm on form.",
    ],
    matchLost: [
      "Well played. I want a rematch.",
      "Good game. Next one is mine.",
    ],
    greeting: [
      "Hello. Let's play well.",
      "Ready when you are.",
    ],
  },
  hugo: {
    coincheMade: [
      "Coinche. Seems reasonable.",
      "Coinche. Let us see.",
    ],
    coincheReceived: [
      "Coinched. Noted.",
      "Hm. Interesting.",
    ],
    contractMade: [
      "Fine. That worked.",
      "Done. Moving on.",
    ],
    contractFailed: [
      "Well. That happened.",
      "Not my finest moment.",
    ],
    capot: [
      "Everything. Huh. Nice.",
      "All of it. Unexpected.",
    ],
    bigTrick: [
      "Not bad.",
      "That'll do.",
    ],
    matchWon: [
      "We won. Surprising, honestly.",
      "Good. I can go home now.",
    ],
    matchLost: [
      "Well played. Truly.",
      "We lost. I'm fine. Really.",
    ],
    greeting: [
      "Hello. Let's begin.",
      "Hello. Shall we?",
    ],
  },
};

// One of the two English lines of `kind` for the character; the same seed always gives the same line.
function lineFor(characterKey, kind, seed) {
  const lines = BOT_LINES[characterKey][kind];
  return lines[Math.abs(Math.trunc(seed)) % lines.length];
}

// The line one round may show, as `{ seat, kind, text }`, or null. `events` are the events of
// bot-reactions.js; `board.seats[i] = { name, team }`; `characterOf(name)` gives `{ key }` or null.
// At most one line: match end first, then coinche, capot, contract made or failed, big trick. An
// event whose team has no bot gives way to the next one (the lost match is said by the other team's bots).
function pickLine(events, board, isBot, characterOf, seed) {
  const seats = board?.seats ?? [];
  const otherTeam = (team) => seats.find((seat) => seat.team !== team)?.team;
  const botsOf = (team) => seats.flatMap((seat, index) => (seat.team === team && isBot(seat.name) ? [index] : []));
  const say = (candidates, kind) => {
    // `candidates` are tried in order; the first one with a bot speaks, the focal seat before its partner.
    for (const { team, seat } of candidates) {
      const bots = botsOf(team);
      if (!bots.length) continue;
      const speaker = bots.includes(seat) ? seat : bots[Math.abs(Math.trunc(seed)) % bots.length];
      const character = characterOf(seats[speaker].name);
      if (character) return { seat: speaker, kind: kind(team), text: lineFor(character.key, kind(team), seed) };
    }
    return null;
  };
  const find = (type, test = () => true) => events.find((event) => event.type === type && test(event));
  const attempts = [
    () => {
      const event = find("match");
      return event && say([{ team: event.team }, { team: otherTeam(event.team) }], (team) => (team === event.team ? "matchWon" : "matchLost"));
    },
    () => {
      const event = find("coinche");
      return event && say([{ team: event.team, seat: event.seat }, { team: otherTeam(event.team) }],
        (team) => (team === event.team ? "coincheMade" : "coincheReceived"));
    },
    () => {
      const event = find("round", (item) => item.capot);
      const winners = event && (event.contractMade ? event.team : otherTeam(event.team));
      return event && say([{ team: winners }], () => "capot");
    },
    () => {
      const event = find("round");
      return event && say([{ team: event.team }], () => (event.contractMade ? "contractMade" : "contractFailed"));
    },
    () => {
      const event = find("trick", (item) => item.big);
      return event && say([{ team: seats[event.seat]?.team, seat: event.seat }], () => "bigTrick");
    },
  ];
  for (const attempt of attempts) {
    const picked = attempt();
    if (picked) return picked;
  }
  return null;
}

// The greeting at the start of a game, as `{ seat, kind: "greeting", text }`, or null. `event` is
// `{ type: "greeting", viewer }`: the bot to the viewer's left greets, else the next bot clockwise.
function greetingFor(event, board, isBot, characterOf, seed) {
  const seats = board?.seats ?? [];
  for (let step = 1; step < seats.length; step++) {
    const seat = (event.viewer + step) % seats.length;
    const character = isBot(seats[seat].name) ? characterOf(seats[seat].name) : null;
    if (character) return { seat, kind: "greeting", text: lineFor(character.key, "greeting", seed) };
  }
  return null;
}

// Decides the comment for `events` and updates `state = { shown, trickShown }`: at most one result
// comment per round (a match end always speaks), plus at most one big-trick comment that does not use
// up the result's turn. A round or match end starts the next round afresh.
function commentFor(state, events, board, isBot, characterOf, seed) {
  const matchEnded = events.some((event) => event.type === "match");
  const roundEnded = matchEnded || events.some((event) => event.type === "round");
  let picked = null;
  if (!state.shown || matchEnded) {
    const speakable = state.shown || state.trickShown ? events.filter((event) => event.type !== "trick") : events;
    picked = pickLine(speakable, board, isBot, characterOf, seed);
    if (picked?.kind === "bigTrick") state.trickShown = true;
    else if (picked) state.shown = true;
  }
  if (roundEnded) {
    state.shown = false;
    state.trickShown = false;
  }
  return picked;
}

if (typeof module !== "undefined") module.exports = { BOT_LINES, lineFor, pickLine, greetingFor, commentFor };
