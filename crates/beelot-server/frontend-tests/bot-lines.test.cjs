const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const KEYS = ["camille", "luc", "manon", "hugo"];
const KINDS = ["coincheMade", "coincheReceived", "contractMade", "contractFailed", "capot", "bigTrick", "matchWon", "matchLost"];
const NS = "North–South";
const EW = "East–West";
const BOTS = new Set(["Camille", "Luc", "Manon", "Hugo"]);
const isBot = (name) => BOTS.has(name);
const characterOf = (name) => (isBot(name) ? { key: name.toLowerCase(), name } : null);
const staticFile = (name) => fs.readFileSync(path.join(__dirname, "..", "static", name), "utf8");

function load() {
  return require("../static/bot-lines.js");
}

// Seats 0 and 2 are North–South, 1 and 3 East–West.
function seatsOf(...names) {
  return { seats: names.map((name, index) => ({ name, team: index % 2 === 0 ? NS : EW })) };
}
const allBots = seatsOf("Camille", "Luc", "Manon", "Hugo");
const humanNS = seatsOf("Ana", "Luc", "Ben", "Hugo");

const allLines = () => {
  const { BOT_LINES } = load();
  return KEYS.flatMap((key) => KINDS.flatMap((kind) => BOT_LINES[key][kind]));
};

test("every character has two lines for every kind", () => {
  const { BOT_LINES } = load();
  assert.deepEqual(Object.keys(BOT_LINES).sort(), [...KEYS].sort());
  for (const key of KEYS) {
    assert.deepEqual(Object.keys(BOT_LINES[key]).sort(), [...KINDS].sort());
    for (const kind of KINDS) {
      assert.equal(BOT_LINES[key][kind].length, 2, `${key} ${kind}`);
    }
  }
});

test("lines are short and give nothing about a hand", () => {
  const banned = /\b(ace|king|queen|jack|ten|hearts?|diamonds?|clubs?|spades?|trumps?|AI)\b/i;
  for (const line of allLines()) {
    assert.ok(line.length > 0 && line.length <= 40, `length of "${line}"`);
    assert.ok(!/\d/.test(line), `digit in "${line}"`);
    assert.ok(!banned.test(line), `banned word in "${line}"`);
  }
});

test("all the lines are distinct", () => {
  const lines = allLines();
  assert.equal(lines.length, 64);
  assert.equal(new Set(lines).size, 64);
});

test("every line and the Settings texts are translated into French and Dutch", () => {
  const quoted = (text) => JSON.stringify(text) + ":";
  const french = staticFile("i18n.js");
  const dutch = staticFile("i18n-nl.js");
  for (const text of [...allLines(), "Bot comments", "Bots comment on the game."]) {
    assert.ok(french.includes(quoted(text)), `French: ${text}`);
    assert.ok(dutch.includes(quoted(text)), `Dutch: ${text}`);
  }
});

test("translated lines keep the 40-character limit", () => {
  for (const file of ["i18n.js", "i18n-nl.js"]) {
    const source = staticFile(file);
    for (const line of allLines()) {
      const match = source.match(new RegExp(`${JSON.stringify(line).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: ("(?:[^"\\\\]|\\\\.)*")`));
      assert.ok(match, `${file}: ${line}`);
      assert.ok(JSON.parse(match[1]).length <= 40, `${file}: ${match[1]}`);
    }
  }
});

test("lineFor is stable for a seed and always gives one of the two lines", () => {
  const { lineFor, BOT_LINES } = load();
  for (const seed of [0, 1, 2, 7, 12345]) {
    const line = lineFor("luc", "capot", seed);
    assert.equal(line, lineFor("luc", "capot", seed));
    assert.ok(BOT_LINES.luc.capot.includes(line));
  }
  assert.notEqual(lineFor("luc", "capot", 0), lineFor("luc", "capot", 1));
});

test("no events or no bots give no line", () => {
  const { pickLine } = load();
  assert.equal(pickLine([], allBots, isBot, characterOf, 0), null);
  const noBots = seatsOf("Ana", "Bo", "Ben", "Cy");
  assert.equal(pickLine([{ type: "trick", seat: 0, big: true }], noBots, isBot, characterOf, 0), null);
  assert.equal(pickLine([{ type: "match", team: NS }], noBots, isBot, characterOf, 0), null);
});

test("a small trick does not speak, a big one does, from the winner", () => {
  const { pickLine, BOT_LINES } = load();
  assert.equal(pickLine([{ type: "trick", seat: 0, big: false }], allBots, isBot, characterOf, 0), null);
  const picked = pickLine([{ type: "trick", seat: 2, big: true }], allBots, isBot, characterOf, 0);
  assert.equal(picked.seat, 2);
  assert.ok(BOT_LINES.manon.bigTrick.includes(picked.text));
});

test("a human trick winner leaves the line to their bot partner", () => {
  const { pickLine, BOT_LINES } = load();
  const board = seatsOf("Ana", "Luc", "Manon", "Hugo");
  const picked = pickLine([{ type: "trick", seat: 0, big: true }], board, isBot, characterOf, 0);
  assert.equal(picked.seat, 2);
  assert.ok(BOT_LINES.manon.bigTrick.includes(picked.text));
});

test("a human-only team never speaks", () => {
  const { pickLine } = load();
  const board = seatsOf("Ana", "Luc", "Ben", "Hugo");
  assert.equal(pickLine([{ type: "trick", seat: 0, big: true }], board, isBot, characterOf, 0), null);
  assert.equal(pickLine([{ type: "round", team: NS, contractMade: true, capot: false }], board, isBot, characterOf, 0), null);
});

test("the speaker is never a human", () => {
  const { pickLine } = load();
  for (const seed of [0, 1, 2, 3]) {
    const picked = pickLine([{ type: "round", team: EW, contractMade: true, capot: false }], humanNS, isBot, characterOf, seed);
    assert.ok(picked && isBot(humanNS.seats[picked.seat].name));
  }
});

test("a round speaks for the declaring team: made or failed", () => {
  const { pickLine, BOT_LINES } = load();
  const made = pickLine([{ type: "round", team: NS, contractMade: true, capot: false }], allBots, isBot, characterOf, 0);
  const key = (seat) => allBots.seats[seat].name.toLowerCase();
  assert.equal(allBots.seats[made.seat].team, NS);
  assert.ok(BOT_LINES[key(made.seat)].contractMade.includes(made.text));
  const failed = pickLine([{ type: "round", team: NS, contractMade: false, capot: false }], allBots, isBot, characterOf, 0);
  assert.equal(allBots.seats[failed.seat].team, NS);
  assert.ok(BOT_LINES[key(failed.seat)].contractFailed.includes(failed.text));
});

test("a capot is spoken by the team that took every trick", () => {
  const { pickLine, BOT_LINES } = load();
  const made = pickLine([{ type: "round", team: NS, contractMade: true, capot: true }], allBots, isBot, characterOf, 0);
  assert.equal(allBots.seats[made.seat].team, NS);
  assert.ok(BOT_LINES[allBots.seats[made.seat].name.toLowerCase()].capot.includes(made.text));
  const against = pickLine([{ type: "round", team: NS, contractMade: false, capot: true }], allBots, isBot, characterOf, 0);
  assert.equal(allBots.seats[against.seat].team, EW);
  assert.ok(BOT_LINES[allBots.seats[against.seat].name.toLowerCase()].capot.includes(against.text));
});

test("a coinche is spoken by the coinching team, else by the team that was coinched", () => {
  const { pickLine, BOT_LINES } = load();
  const coincher = pickLine([{ type: "coinche", team: EW, seat: 3 }], allBots, isBot, characterOf, 0);
  assert.equal(coincher.seat, 3);
  assert.ok(BOT_LINES.hugo.coincheMade.includes(coincher.text));
  const received = pickLine([{ type: "coinche", team: NS, seat: 0 }], seatsOf("Ana", "Luc", "Ben", "Hugo"), isBot, characterOf, 0);
  assert.ok(received.seat === 1 || received.seat === 3);
  assert.ok(BOT_LINES[allBots.seats[received.seat].name.toLowerCase()].coincheReceived.includes(received.text));
});

test("priority: match, then coinche, capot, contract, big trick", () => {
  const { pickLine, BOT_LINES } = load();
  const trick = { type: "trick", seat: 0, big: true };
  const round = { type: "round", team: NS, contractMade: true, capot: false };
  const capot = { type: "round", team: NS, contractMade: true, capot: true };
  const coinche = { type: "coinche", team: EW, seat: 1 };
  const match = { type: "match", team: NS };
  const kindOf = (picked) => {
    const key = allBots.seats[picked.seat].name.toLowerCase();
    return KINDS.find((kind) => BOT_LINES[key][kind].includes(picked.text));
  };
  assert.equal(kindOf(pickLine([trick, round], allBots, isBot, characterOf, 0)), "contractMade");
  assert.equal(kindOf(pickLine([trick, capot], allBots, isBot, characterOf, 0)), "capot");
  assert.equal(kindOf(pickLine([trick, capot, coinche], allBots, isBot, characterOf, 0)), "coincheMade");
  assert.equal(kindOf(pickLine([trick, capot, coinche, match], allBots, isBot, characterOf, 0)), "matchWon");
});

test("a match end always speaks: the winners, else the losing bots", () => {
  const { pickLine, BOT_LINES } = load();
  const won = pickLine([{ type: "match", team: NS }], allBots, isBot, characterOf, 0);
  assert.equal(allBots.seats[won.seat].team, NS);
  assert.ok(BOT_LINES[allBots.seats[won.seat].name.toLowerCase()].matchWon.includes(won.text));
  const lost = pickLine([{ type: "match", team: NS }], humanNS, isBot, characterOf, 0);
  assert.equal(humanNS.seats[lost.seat].team, EW);
  assert.ok(BOT_LINES[humanNS.seats[lost.seat].name.toLowerCase()].matchLost.includes(lost.text));
});

test("pickLine is stable for a seed and gives a single result", () => {
  const { pickLine } = load();
  const events = [{ type: "trick", seat: 0, big: true }, { type: "round", team: NS, contractMade: true, capot: false }];
  const first = pickLine(events, allBots, isBot, characterOf, 5);
  assert.deepEqual(first, pickLine(events, allBots, isBot, characterOf, 5));
  assert.ok(!Array.isArray(first));
  assert.deepEqual(Object.keys(first).sort(), ["seat", "text"]);
});
