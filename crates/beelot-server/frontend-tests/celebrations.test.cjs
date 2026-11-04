const test = require("node:test");
const assert = require("node:assert/strict");
const { MOMENTS, momentsForRound, momentForBelote, createBeloteWatcher } = require("../static/celebrations.js");

const NS = "North–South";
const EW = "East–West";

const round = (overrides = {}) => ({
  contractMade: true,
  capotTeam: "",
  northSouthAwarded: 100,
  eastWestAwarded: 62,
  northSouthBeloteBonus: 0,
  eastWestBeloteBonus: 0,
  ...overrides,
});
const board = (overrides = {}) => ({
  declaringTeam: NS,
  coinched: false,
  variant: "CLASSIC",
  contractValue: 0,
  ...overrides,
});
const kinds = (chips) => chips.map((chip) => chip.kind);

test("the table gives every kind a text, an effect and a sound", () => {
  assert.equal(MOMENTS.matchWin.text, "Victory!");
  assert.equal(MOMENTS.capot.text, "Capot!");
  assert.equal(MOMENTS.coincheWon.text, "Coinche!");
  assert.equal(MOMENTS.defended.text, "Down!");
  assert.equal(MOMENTS.roundWon.text, "Round won!");
  assert.equal(MOMENTS.contractLost.text, "Down!");
  assert.equal(MOMENTS.belote.text, "Belote!");
  assert.equal(MOMENTS.rebelote.text, "Rebelote!");
  assert.equal(MOMENTS.matchWin.effect, "large-confetti");
  assert.equal(MOMENTS.coincheWon.effect, "stars");
  assert.equal(MOMENTS.contractLost.effect, "none");
  assert.equal(MOMENTS.roundWon.sound, "roundWin");
  assert.equal(MOMENTS.rebelote.sound, "belote");
});

test("a won match outranks everything and keeps the capot as a chip", () => {
  const result = momentsForRound({
    round: round({ capotTeam: NS }),
    board: board(),
    match: { complete: true, winner: NS, target: 1000 },
    myTeam: 0,
  });
  assert.equal(result.sticker, "matchWin");
  assert.deepEqual(kinds(result.chips).slice(0, 2), ["capot", "roundWon"]);
});

test("a capot of my team is the sticker with a +250 chip", () => {
  const result = momentsForRound({ round: round({ capotTeam: NS }), board: board(), match: null, myTeam: 0 });
  assert.equal(result.sticker, "capot");
  assert.deepEqual(result.chips.at(-1), { kind: "points", text: "+250" });
});

test("a Contrée capot of the declarers adds the bid to the 250", () => {
  const result = momentsForRound({
    round: round({ capotTeam: NS }),
    board: board({ variant: "CONTREE", contractValue: 80 }),
    match: null,
    myTeam: 0,
  });
  assert.deepEqual(result.chips.at(-1), { kind: "points", text: "+330" });
});

test("a coinched contract my team made is a coinche won", () => {
  const result = momentsForRound({ round: round(), board: board({ coinched: true }), match: null, myTeam: 0 });
  assert.equal(result.sticker, "coincheWon");
});

test("a coinched contract the opponents failed is a coinche won", () => {
  const result = momentsForRound({
    round: round({ contractMade: false, northSouthAwarded: 162, eastWestAwarded: 0 }),
    board: board({ declaringTeam: EW, coinched: true }),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "coincheWon");
});

test("a coinched contract my team failed is only a lost contract", () => {
  const result = momentsForRound({
    round: round({ contractMade: false, northSouthAwarded: 0, eastWestAwarded: 162 }),
    board: board({ coinched: true }),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "contractLost");
});

test("an opponents' contract that failed without a coinche is defended", () => {
  const result = momentsForRound({
    round: round({ contractMade: false, northSouthAwarded: 162, eastWestAwarded: 0 }),
    board: board({ declaringTeam: EW }),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "defended");
  assert.deepEqual(kinds(result.chips), ["roundWon"]);
});

test("a tie on awarded points is a round won", () => {
  const result = momentsForRound({
    round: round({ northSouthAwarded: 81, eastWestAwarded: 81 }),
    board: board(),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "roundWon");
});

test("a lost contract stands alone even when the awarded points tie", () => {
  const result = momentsForRound({
    round: round({ contractMade: false, northSouthAwarded: 81, eastWestAwarded: 81 }),
    board: board(),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "contractLost");
  assert.deepEqual(result.chips, []);
});

test("my belote bonus adds a chip and the opponents' does not", () => {
  const mine = momentsForRound({ round: round({ northSouthBeloteBonus: 20 }), board: board(), match: null, myTeam: 0 });
  assert.deepEqual(mine.chips.at(-1), { kind: "belote", text: "Belote ✓" });
  const theirs = momentsForRound({ round: round({ eastWestBeloteBonus: 20 }), board: board(), match: null, myTeam: 0 });
  assert.ok(!kinds(theirs.chips).includes("belote"));
});

test("the belote chip stays on a lost contract", () => {
  const result = momentsForRound({
    round: round({ contractMade: false, northSouthAwarded: 20, eastWestAwarded: 142, northSouthBeloteBonus: 20 }),
    board: board(),
    match: null,
    myTeam: 0,
  });
  assert.equal(result.sticker, "contractLost");
  assert.deepEqual(result.chips, [{ kind: "belote", text: "Belote ✓" }]);
});

test("East–West is mine when myTeam is 1", () => {
  const result = momentsForRound({
    round: round({ capotTeam: EW, northSouthAwarded: 0, eastWestAwarded: 252 }),
    board: board({ declaringTeam: EW }),
    match: null,
    myTeam: 1,
  });
  assert.equal(result.sticker, "capot");
});

test("nothing is celebrated for the opponents", () => {
  assert.equal(
    momentsForRound({
      round: round({ capotTeam: EW, northSouthAwarded: 0, eastWestAwarded: 252 }),
      board: board({ declaringTeam: EW }),
      match: null,
      myTeam: 0,
    }),
    null,
  );
  assert.equal(
    momentsForRound({
      round: round({ northSouthAwarded: 40, eastWestAwarded: 122 }),
      board: board(),
      match: { complete: true, winner: EW, target: 1000 },
      myTeam: 0,
    }),
    null,
  );
});

test("a viewer in no team gets nothing", () => {
  assert.equal(momentsForRound({ round: round(), board: board(), match: null, myTeam: null }), null);
});

test("a missing capot team and an incomplete match do not throw", () => {
  const result = momentsForRound({
    round: round({ capotTeam: null }),
    board: board(),
    match: { complete: false },
    myTeam: 0,
  });
  assert.equal(result.sticker, "roundWon");
});

const seats = (names) => names.map((name, index) => ({ name, team: index % 2 === 0 ? NS : EW }));

test("my team's belote and rebelote are celebrated", () => {
  const table = seats(["Ann", "Bob", "Cy", "Di"]);
  assert.equal(momentForBelote({ message: "Ann declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), "belote");
  assert.equal(
    momentForBelote({ message: "Cy declares Rebelote: 20 bonus points.", previousMessage: "Cy declares Belote.", seats: table, myTeam: 0 }),
    "rebelote",
  );
});

test("the opponents' belote is not celebrated", () => {
  const table = seats(["Ann", "Bob", "Cy", "Di"]);
  assert.equal(momentForBelote({ message: "Bob declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), null);
});

test("a message already seen, a first message and an empty message give nothing", () => {
  const table = seats(["Ann", "Bob", "Cy", "Di"]);
  assert.equal(momentForBelote({ message: "Ann declares Belote.", previousMessage: "Ann declares Belote.", seats: table, myTeam: 0 }), null);
  assert.equal(momentForBelote({ message: "Ann declares Belote.", previousMessage: undefined, seats: table, myTeam: 0 }), null);
  assert.equal(momentForBelote({ message: "", previousMessage: "Ann declares Belote.", seats: table, myTeam: 0 }), null);
});

test("a name that starts another name resolves to the right seat", () => {
  const table = [
    { name: "Alex", team: NS },
    { name: "Bob", team: EW },
    { name: "Al", team: EW },
    { name: "Di", team: NS },
  ];
  assert.equal(momentForBelote({ message: "Alex declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), "belote");
  assert.equal(momentForBelote({ message: "Al declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), null);
});

test("names with regular-expression characters resolve to the right seat", () => {
  const table = [
    { name: "A.B", team: NS },
    { name: "(x)", team: EW },
    { name: "C+", team: NS },
    { name: "D*", team: EW },
  ];
  assert.equal(momentForBelote({ message: "A.B declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), "belote");
  assert.equal(momentForBelote({ message: "(x) declares Belote.", previousMessage: "", seats: table, myTeam: 0 }), null);
  assert.equal(momentForBelote({ message: "(x) declares Belote.", previousMessage: "", seats: table, myTeam: 1 }), "belote");
});

test("a viewer in no team gets no belote celebration", () => {
  const table = seats(["Ann", "Bob", "Cy", "Di"]);
  assert.equal(momentForBelote({ message: "Ann declares Belote.", previousMessage: "", seats: table, myTeam: null }), null);
});

test("a lost match gets no sticker even when my team won the last round", () => {
  assert.equal(
    momentsForRound({
      round: round({ capotTeam: NS, northSouthAwarded: 252, eastWestAwarded: 0 }),
      board: board(),
      match: { complete: true, winner: EW, target: 1000 },
      myTeam: 0,
    }),
    null,
  );
});

const table4 = seats(["Ann", "Bob", "Cy", "Di"]);
const watch = (watcher, message, myTeam) => watcher.watch({ message, seats: table4, myTeam });

test("the watcher ignores the first message it sees", () => {
  const watcher = createBeloteWatcher();
  assert.equal(watch(watcher, "Ann declares Belote.", 0), null);
  assert.equal(watch(watcher, "Ann declares Belote.", 0), null);
});

test("the watcher celebrates a new belote of my team once", () => {
  const watcher = createBeloteWatcher();
  assert.equal(watch(watcher, "", 0), null);
  assert.equal(watch(watcher, "Ann declares Belote.", 0), "belote");
  assert.equal(watch(watcher, "Ann declares Belote.", 0), null);
  assert.equal(watch(watcher, "Ann declares Rebelote: 20 bonus points.", 0), "rebelote");
});

test("the watcher never celebrates the opponents' belote", () => {
  const watcher = createBeloteWatcher();
  watch(watcher, "", 0);
  assert.equal(watch(watcher, "Bob declares Belote.", 0), null);
  assert.equal(watch(watcher, "Bob declares Belote.", 0), null);
});

test("in pass-and-play a belote waits until the declarer's team looks", () => {
  const watcher = createBeloteWatcher();
  watch(watcher, "", 1);
  // Ann (North–South) declares; the device shows East–West next.
  assert.equal(watch(watcher, "Ann declares Belote.", 1), null);
  // Then Cy, Ann's partner, looks at the same board.
  assert.equal(watch(watcher, "Ann declares Belote.", 0), "belote");
  assert.equal(watch(watcher, "Ann declares Belote.", 0), null);
});

test("a pending belote is dropped when the message changes or resets", () => {
  const watcher = createBeloteWatcher();
  watch(watcher, "", 1);
  watch(watcher, "Ann declares Belote.", 1);
  assert.equal(watch(watcher, "", 0), null);
  assert.equal(watch(watcher, "", 0), null);
});

test("a viewer in no team never gets a belote", () => {
  const watcher = createBeloteWatcher();
  watch(watcher, "", null);
  assert.equal(watch(watcher, "Ann declares Belote.", null), null);
});
