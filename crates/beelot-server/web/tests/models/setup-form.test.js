import { test } from "vitest";
import assert from "node:assert/strict";
import { SETUP_MODES, DEFAULT_SETUP, defaultTarget, loadSetup, saveSetup, setupBlocks, createRequest, setupPath, setupHome, submitLabel, targetsOf } from "$lib/models/setup-form";
import { seatCountOf } from "$lib/models/seat-count";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};
const blockedStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  }
};

test("the modes are solo, pass and crew and the defaults are a relaxed 1,000-point Classic game", () => {
  assert.deepEqual(SETUP_MODES, ["solo", "pass", "crew"]);
  assert.deepEqual(DEFAULT_SETUP, { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000, klaverjasRules: "AMSTERDAMS" });
});

test("with nothing saved every mode loads the defaults", () => {
  for (const mode of SETUP_MODES) assert.deepEqual(loadSetup(memoryStorage(), mode), DEFAULT_SETUP);
});

test("choices are remembered per mode and do not leak into another mode", () => {
  const storage = memoryStorage();
  const solo = { variant: "CONTREE", difficulty: "CHALLENGING", announcements: false, allTrumps: false, target: 500, klaverjasRules: "ROTTERDAMS" };
  saveSetup(storage, "solo", solo);
  assert.deepEqual(loadSetup(storage, "solo"), solo);
  assert.deepEqual(loadSetup(storage, "pass"), DEFAULT_SETUP);
  assert.deepEqual(loadSetup(storage, "crew"), DEFAULT_SETUP);
});

test("an invalid or incomplete entry loads the defaults, except that a crew table keeps its variant", () => {
  const storage = memoryStorage();
  storage.setItem("beelot.setup.pass", JSON.stringify({ variant: "TAROT", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 }));
  storage.setItem("beelot.setup.crew", JSON.stringify({ variant: "CONTREE" }));
  storage.setItem("beelot.setup.solo", JSON.stringify({ variant: "CLASSIC", difficulty: "RELAXED", announcements: "yes", allTrumps: true, target: 700 }));
  assert.deepEqual(loadSetup(storage, "pass"), DEFAULT_SETUP);
  assert.deepEqual(loadSetup(storage, "crew"), { ...DEFAULT_SETUP, variant: "CONTREE" });
  assert.deepEqual(loadSetup(storage, "solo"), DEFAULT_SETUP);
  storage.setItem("beelot.setup.solo", JSON.stringify({ variant: "CONTREE" }));
  assert.deepEqual(loadSetup(storage, "solo"), DEFAULT_SETUP);
  storage.setItem("beelot.setup.solo", "not json");
  assert.deepEqual(loadSetup(storage, "solo"), DEFAULT_SETUP);
});

test("blocked storage never throws and loads the defaults", () => {
  assert.doesNotThrow(() => saveSetup(blockedStorage, "solo", DEFAULT_SETUP));
  assert.deepEqual(loadSetup(blockedStorage, "solo"), DEFAULT_SETUP);
});

test("solo falls back to the choices the old setup form remembered, until it saves its own", () => {
  const storage = memoryStorage();
  const legacy = { kind: "LOCAL", difficulty: "CHALLENGING", variant: "CONTREE", announcements: false, allTrumps: true, target: 1500 };
  storage.setItem("beelot.bot-game", JSON.stringify(legacy));
  assert.equal(loadSetup(storage, "solo").target, 1500);
  assert.equal(loadSetup(storage, "pass").target, 1000);
  saveSetup(storage, "solo", { ...DEFAULT_SETUP, target: 2000 });
  assert.equal(loadSetup(storage, "solo").target, 2000);
});

test("an unknown mode loads the defaults", () => {
  assert.deepEqual(loadSetup(memoryStorage(), "tarot"), DEFAULT_SETUP);
});

test("Klaberjass has no announcements, a 500-point default and two seats", () => {
  assert.equal(setupBlocks("solo", "KLABERJASS").announcements, false);
  assert.equal(defaultTarget("KLABERJASS"), 500);
  assert.equal(seatCountOf("KLABERJASS"), 2);
  assert.equal(seatCountOf("CLASSIC"), 4);
  const request = createRequest("pass", { ...DEFAULT_SETUP, variant: "KLABERJASS", seats: ["Ana", "Ben", "", ""], playerName: "" });
  assert.deepEqual(request.seats, ["Ana", "Ben"]);
});

test("Klaverjas has no in-hand announcements, a 1,500-point default and four seats (US-213)", () => {
  assert.equal(setupBlocks("solo", "KLAVERJAS").announcements, false);
  assert.equal(defaultTarget("KLAVERJAS"), 1500);
  assert.equal(seatCountOf("KLAVERJAS"), 4);
  const storage = memoryStorage();
  saveSetup(storage, "solo", { ...DEFAULT_SETUP, variant: "KLAVERJAS", target: 1500 });
  assert.equal(loadSetup(storage, "solo").variant, "KLAVERJAS");
});

test("Klaverjas is played by the Amsterdam or the Rotterdam rules, chosen in the sheet (US-214)", () => {
  assert.equal(setupBlocks("solo", "KLAVERJAS").klaverjasRules, true);
  assert.equal(setupBlocks("pass", "KLAVERJAS").klaverjasRules, true);
  // A crew table's owner chooses them in the lobby.
  assert.equal(setupBlocks("crew", "KLAVERJAS").klaverjasRules, false);
  assert.equal(setupBlocks("solo", "CLASSIC").klaverjasRules, false);
  const values = { ...DEFAULT_SETUP, variant: "KLAVERJAS", target: 1500, klaverjasRules: "ROTTERDAMS", seats: [], playerName: "" };
  assert.equal(createRequest("solo", values).klaverjasRules, "ROTTERDAMS");
  assert.equal("klaverjasRules" in createRequest("solo", { ...values, variant: "CLASSIC" }), false);
  const storage = memoryStorage();
  saveSetup(storage, "solo", { variant: "KLAVERJAS", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1500, klaverjasRules: "ROTTERDAMS" });
  assert.equal(loadSetup(storage, "solo").klaverjasRules, "ROTTERDAMS");
  // A setup saved before the rule sets, or with an unknown one, plays the Amsterdam rules.
  saveSetup(storage, "solo", { variant: "KLAVERJAS", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1500 });
  assert.deepEqual(loadSetup(storage, "solo"), { ...DEFAULT_SETUP, variant: "KLAVERJAS", target: 1500 });
  saveSetup(storage, "solo", { variant: "KLAVERJAS", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1500, klaverjasRules: "UTRECHTS" });
  assert.equal(loadSetup(storage, "solo").klaverjasRules, "AMSTERDAMS");
});

test("Bazar Blot is played in tens to 101, 151, 201 or 301, with announcements and four seats (US-216)", () => {
  assert.equal(defaultTarget("BAZAR_BLOT"), 301);
  assert.deepEqual(targetsOf("BAZAR_BLOT"), [101, 151, 201, 301]);
  assert.deepEqual(targetsOf("CLASSIC"), [500, 1000, 1500, 2000]);
  assert.equal(setupBlocks("solo", "BAZAR_BLOT").announcements, true);
  assert.equal(setupBlocks("solo", "BAZAR_BLOT").allTrumps, false);
  assert.equal(seatCountOf("BAZAR_BLOT"), 4);
  const storage = memoryStorage();
  saveSetup(storage, "solo", { ...DEFAULT_SETUP, variant: "BAZAR_BLOT", target: 201 });
  assert.equal(loadSetup(storage, "solo").target, 201);
  // A target the variant does not offer is not kept.
  saveSetup(storage, "solo", { ...DEFAULT_SETUP, variant: "BAZAR_BLOT", target: 1000 });
  assert.deepEqual(loadSetup(storage, "solo"), DEFAULT_SETUP);
});

test("each mode shows its own blocks, and tout-atout only for Contrée", () => {
  assert.deepEqual(setupBlocks("solo", "CLASSIC"), { seats: false, owner: false, bots: true, rules: true, announcements: true, allTrumps: false, klaverjasRules: false });
  assert.deepEqual(setupBlocks("solo", "CONTREE"), { seats: false, owner: false, bots: true, rules: true, announcements: true, allTrumps: true, klaverjasRules: false });
  assert.deepEqual(setupBlocks("pass", "CLASSIC"), { seats: true, owner: false, bots: true, rules: true, announcements: true, allTrumps: false, klaverjasRules: false });
  assert.deepEqual(setupBlocks("pass", "CONTREE"), { seats: true, owner: false, bots: true, rules: true, announcements: true, allTrumps: true, klaverjasRules: false });
  assert.deepEqual(setupBlocks("crew", "CLASSIC"), { seats: false, owner: true, bots: false, rules: false, announcements: false, allTrumps: false, klaverjasRules: false });
  assert.deepEqual(setupBlocks("crew", "CONTREE"), { seats: false, owner: true, bots: false, rules: false, announcements: false, allTrumps: false, klaverjasRules: false });
  // Bela always plays its declarations, so it has no switch for them (US-218).
  assert.deepEqual(setupBlocks("solo", "BELA"), { seats: false, owner: false, bots: true, rules: true, announcements: false, allTrumps: false, klaverjasRules: false });
});

test("the create request of each mode is what the table API takes", () => {
  const values = { variant: "CONTREE", difficulty: "CHALLENGING", announcements: false, allTrumps: true, target: 500, seats: ["  Ann ", "", "Cy", " "], playerName: "Zoe" };
  const local = { kind: "LOCAL", difficulty: "CHALLENGING", variant: "CONTREE", announcements: false, allTrumps: true, target: 500 };
  assert.deepEqual(createRequest("solo", values), local);
  assert.deepEqual(createRequest("pass", values), { ...local, seats: ["Ann", null, "Cy", null] });
  assert.deepEqual(createRequest("crew", values), { kind: "PRIVATE", playerName: "Zoe", variant: "CONTREE" });
});

test("each mode has its address, its way home and its button text", () => {
  assert.deepEqual(SETUP_MODES.map(setupPath), ["/play/bot", "/play/local", "/online/private/new"]);
  assert.deepEqual(SETUP_MODES.map(setupHome), ["/", "/", "/online/private"]);
  assert.deepEqual(SETUP_MODES.map(submitLabel), ["Deal the cards", "Start pass and play", "Create private table"]);
});

test("a Contrée match defaults to 2,000 points and a Classic one to 1,000 (US-130)", () => {
  assert.equal(defaultTarget("CONTREE"), 2000);
  assert.equal(defaultTarget("CLASSIC"), 1000);
  assert.equal(defaultTarget(undefined), 1000);
  assert.ok([500, 1000, 1500, 2000].includes(defaultTarget("CONTREE")));
});
