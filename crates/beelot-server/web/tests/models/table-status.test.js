import { test } from "vitest";
import assert from "node:assert/strict";
import { tableStatus } from "$lib/models/table-status";


const play = { phase: "play", myTurn: true, activeName: "Emile", passAndPlay: false };
const bidding = { phase: "bidding", myTurn: true, activeName: "Emile", passAndPlay: false };

test("it is the player's turn to play, or a bot is thinking", () => {
  assert.deepEqual(tableStatus(play), { text: "Your turn to play", args: [] });
  assert.deepEqual(tableStatus({ ...play, myTurn: false, activeName: "Luc" }), { text: "{0} is thinking…", args: ["Luc"] });
});

test("pass and play names the player instead of saying You", () => {
  assert.deepEqual(tableStatus({ ...play, passAndPlay: true }), { text: "{0}, your turn to play", args: ["Emile"] });
  assert.deepEqual(tableStatus({ ...bidding, passAndPlay: true }), { text: "{0}, your turn to bid", args: ["Emile"] });
});

test("bidding: my turn, a bot's turn, auction over", () => {
  assert.deepEqual(tableStatus(bidding), { text: "Your turn to bid", args: [] });
  assert.deepEqual(tableStatus({ ...bidding, myTurn: false, activeName: "Luc" }), { text: "{0} is thinking…", args: ["Luc"] });
  assert.deepEqual(tableStatus({ ...bidding, complete: true }), { text: "The auction is over", args: [] });
});

test("play: a collected trick, dealing and a finished round come before the turn", () => {
  assert.deepEqual(tableStatus({ ...play, reviewingTrick: true, trickWinner: "Luc" }), { text: "{0} takes the trick", args: ["Luc"] });
  assert.deepEqual(tableStatus({ ...play, dealing: true }), { text: "Dealing the remaining cards…", args: [] });
  assert.deepEqual(tableStatus({ ...play, roundOver: true, reviewingTrick: true, dealing: true }), { text: "Round over", args: [] });
});


