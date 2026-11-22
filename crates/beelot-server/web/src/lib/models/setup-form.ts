// The setup sheet's logic (US-118): what each mode asks, what the device remembers per mode (US-102) and the request that
// starts the game.
import type { SetupMode } from "./routes";

export const SETUP_MODES: SetupMode[] = ["solo", "pass", "crew"];

export interface Setup {
  variant: "CLASSIC" | "CONTREE";
  difficulty: "RELAXED" | "CHALLENGING";
  announcements: boolean;
  allTrumps: boolean;
  target: number;
}

export const DEFAULT_SETUP: Setup = { variant: "CLASSIC", difficulty: "RELAXED", announcements: true, allTrumps: true, target: 1000 };
export const TARGETS = [500, 1000, 1500, 2000];

// The points a match is played to when the players choose nothing else: 2,000 in Contrée, 1,000 in Classic (US-130).
export function defaultTarget(variant: string): number {
  return variant === "CONTREE" ? 2000 : 1000;
}

const LEGACY_SOLO_KEY = "beelot.bot-game";
const setupKey = (mode: SetupMode) => `beelot.setup.${mode}`;

function isValidSetup(saved: any): saved is Setup {
  return (
    Boolean(saved) &&
    ["RELAXED", "CHALLENGING"].includes(saved.difficulty) &&
    ["CLASSIC", "CONTREE"].includes(saved.variant) &&
    typeof saved.announcements === "boolean" &&
    typeof saved.allTrumps === "boolean" &&
    TARGETS.includes(saved.target)
  );
}

function readSaved(storage: Storage, key: string): any {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// The choices last made in this mode. A crew table only remembers its variant. Anything incomplete or invalid, or storage
// that is blocked, gives the defaults.
export function loadSetup(storage: Storage, mode: SetupMode): Setup {
  if (!SETUP_MODES.includes(mode)) return DEFAULT_SETUP;
  const saved = readSaved(storage, setupKey(mode)) ?? (mode === "solo" ? readSaved(storage, LEGACY_SOLO_KEY) : null);
  if (!saved) return DEFAULT_SETUP;
  if (mode === "crew") return ["CLASSIC", "CONTREE"].includes(saved.variant) ? { ...DEFAULT_SETUP, variant: saved.variant } : DEFAULT_SETUP;
  if (!isValidSetup(saved)) return DEFAULT_SETUP;
  const { variant, difficulty, announcements, allTrumps, target } = saved;
  return { variant, difficulty, announcements, allTrumps, target };
}

export function saveSetup(storage: Storage, mode: SetupMode, setup: Partial<Setup>): void {
  try {
    storage.setItem(setupKey(mode), JSON.stringify(setup));
  } catch {
    // Storage may be blocked: the next setup simply starts from the defaults.
  }
}

// Which parts of the sheet a mode shows.
export function setupBlocks(mode: SetupMode, variant: string) {
  const played = mode !== "crew";
  return { seats: mode === "pass", owner: mode === "crew", bots: played, rules: played, allTrumps: played && variant === "CONTREE" };
}

const trimmedOrNull = (name: unknown) => String(name ?? "").trim() || null;

export interface SetupValues extends Setup {
  seats: string[];
  playerName: string;
}

export function createRequest(mode: SetupMode, values: SetupValues): Record<string, unknown> {
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

const setupPaths: Record<SetupMode, string> = { solo: "/play/bot", pass: "/play/local", crew: "/online/private/new" };
const setupHomes: Record<SetupMode, string> = { solo: "/", pass: "/", crew: "/online/private" };
const submitLabels: Record<SetupMode, string> = { solo: "Deal the cards", pass: "Start pass and play", crew: "Create private table" };

export const setupPath = (mode: SetupMode) => setupPaths[mode];
export const setupHome = (mode: SetupMode) => setupHomes[mode];
export const submitLabel = (mode: SetupMode) => submitLabels[mode];
