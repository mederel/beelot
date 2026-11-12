// The setup sheet's logic (US-118): what each mode asks, what the device remembers per mode (US-102) and the request
// that starts the game. Plain data in, plain data out, so that it is tested without a page.
const SETUP_MODES = ["solo", "pass", "crew"];
const DEFAULT_SETUP = { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 };
// The points a match is played to when the players choose nothing else: 2,000 in Contrée, 1,000 in Classic (US-130).
function defaultTarget(variant) {
  return variant === "CONTREE" ? 2000 : 1000;
}
const LEGACY_SOLO_KEY = "beelot.bot-game";

function setupKey(mode) {
  return `beelot.setup.${mode}`;
}

function isValidSetup(saved) {
  return Boolean(saved)
    && ["RELAXED", "CHALLENGING"].includes(saved.difficulty)
    && ["CLASSIC", "CONTREE"].includes(saved.variant)
    && typeof saved.announcements === "boolean"
    && typeof saved.allTrumps === "boolean"
    && [500, 1000, 1500, 2000].includes(saved.target);
}

function readSaved(storage, key) {
  try {
    const saved = JSON.parse(storage.getItem(key));
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// The choices last made in this mode. A crew table only remembers its variant. Anything incomplete or invalid, or
// storage that is blocked, gives the defaults.
function loadSetup(storage, mode) {
  if (!SETUP_MODES.includes(mode)) return DEFAULT_SETUP;
  const saved = readSaved(storage, setupKey(mode)) ?? (mode === "solo" ? readSaved(storage, LEGACY_SOLO_KEY) : null);
  if (!saved) return DEFAULT_SETUP;
  if (mode === "crew") return ["CLASSIC", "CONTREE"].includes(saved.variant) ? { ...DEFAULT_SETUP, variant: saved.variant } : DEFAULT_SETUP;
  if (!isValidSetup(saved)) return DEFAULT_SETUP;
  const { variant, difficulty, announcements, allTrumps, target } = saved;
  return { variant, difficulty, announcements, allTrumps, target };
}

function saveSetup(storage, mode, setup) {
  try {
    storage.setItem(setupKey(mode), JSON.stringify(setup));
  } catch {
    // Storage may be blocked: the next setup simply starts from the defaults.
  }
}

// Which parts of the sheet a mode shows: the seat names at a pass-and-play table, the owner's name for a crew table,
// the bots and the rules for the two modes played here, tout-atout and sans-atout only in Contrée.
function setupBlocks(mode, variant) {
  const played = mode !== "crew";
  return { seats: mode === "pass", owner: mode === "crew", bots: played, rules: played, allTrumps: played && variant === "CONTREE" };
}

const trimmedOrNull = (name) => (String(name ?? "").trim() || null);

function createRequest(mode, values) {
  if (mode === "crew") return { kind: "PRIVATE", playerName: values.playerName, variant: values.variant };
  const request = {
    kind: "LOCAL",
    difficulty: values.difficulty,
    variant: values.variant,
    announcements: values.announcements,
    allTrumps: values.allTrumps,
    target: values.target
  };
  return mode === "pass" ? { ...request, seats: values.seats.map(trimmedOrNull) } : request;
}

const setupPaths = { solo: "/play/bot", pass: "/play/local", crew: "/online/private/new" };
const setupHomes = { solo: "/", pass: "/", crew: "/online/private" };
const submitLabels = { solo: "Deal the cards", pass: "Start pass and play", crew: "Create private table" };

function setupPath(mode) {
  return setupPaths[mode];
}

function setupHome(mode) {
  return setupHomes[mode];
}

function submitLabel(mode) {
  return submitLabels[mode];
}

if (typeof module !== "undefined") {
  module.exports = { SETUP_MODES, DEFAULT_SETUP, defaultTarget, loadSetup, saveSetup, setupBlocks, createRequest, setupPath, setupHome, submitLabel };
}
