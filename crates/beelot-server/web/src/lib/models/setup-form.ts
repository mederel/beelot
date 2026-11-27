// The setup sheet's logic (US-118): what each mode asks, what the device remembers per mode (US-102) and the request that
// starts the game.
import type { KlaverjasRules } from "$lib/api/types";
import { KEYS, readJson, setupKey, writeJson, type Store } from "$lib/storage";
import { seatCountOf } from "./seat-count";
import type { SetupMode } from "./routes";

export const SETUP_MODES: SetupMode[] = ["solo", "pass", "crew"];

export interface Setup {
  variant: "CLASSIC" | "CONTREE" | "BELA" | "BULGARIAN" | "KLABERJASS" | "KLAVERJAS" | "BAZAR_BLOT";
  difficulty: "RELAXED" | "CHALLENGING";
  announcements: boolean;
  allTrumps: boolean;
  target: number;
  klaverjasRules: KlaverjasRules;
}

export const DEFAULT_SETUP: Setup = {
  variant: "CLASSIC",
  difficulty: "RELAXED",
  announcements: true,
  allTrumps: true,
  target: 1000,
  klaverjasRules: "AMSTERDAMS"
};
export const KLAVERJAS_RULES: KlaverjasRules[] = ["AMSTERDAMS", "ROTTERDAMS"];
export const VARIANTS = ["CLASSIC", "CONTREE", "BELA", "BULGARIAN", "KLABERJASS", "KLAVERJAS", "BAZAR_BLOT"];
export const TARGETS = [500, 1000, 1500, 2000];
// Bazar Blot is scored in tens ("sai"), so its targets are smaller (US-216).
export const BAZAR_BLOT_TARGETS = [101, 151, 201, 301];

// The match targets players may choose for the variant.
export function targetsOf(variant: string): number[] {
  return variant === "BAZAR_BLOT" ? BAZAR_BLOT_TARGETS : TARGETS;
}

// The points a match is played to when the players choose nothing else: 2,000 in Contrée, 1,000 in Classic (US-130), 500 in
// Klaberjass (US-219), 1,500 in Klaverjas (US-213), 301 in Bazar Blot (US-216).
export function defaultTarget(variant: string): number {
  if (variant === "BAZAR_BLOT") return 301;
  if (variant === "KLABERJASS") return 500;
  if (variant === "KLAVERJAS") return 1500;
  return variant === "CONTREE" ? 2000 : 1000;
}

const LEGACY_SOLO_KEY = KEYS.legacySoloSetup;

function isValidSetup(saved: any): saved is Setup {
  return (
    Boolean(saved) &&
    ["RELAXED", "CHALLENGING"].includes(saved.difficulty) &&
    VARIANTS.includes(saved.variant) &&
    typeof saved.announcements === "boolean" &&
    typeof saved.allTrumps === "boolean" &&
    targetsOf(saved.variant).includes(saved.target)
  );
}

function readSaved(storage: Store, key: string): any {
  return readJson(storage, key, null, (saved): saved is object => Boolean(saved) && typeof saved === "object");
}

// The choices last made in this mode. A crew table only remembers its variant. Anything incomplete or invalid, or storage
// that is blocked, gives the defaults.
export function loadSetup(storage: Store, mode: SetupMode): Setup {
  if (!SETUP_MODES.includes(mode)) return DEFAULT_SETUP;
  const saved = readSaved(storage, setupKey(mode)) ?? (mode === "solo" ? readSaved(storage, LEGACY_SOLO_KEY) : null);
  if (!saved) return DEFAULT_SETUP;
  if (mode === "crew") return VARIANTS.includes(saved.variant) ? { ...DEFAULT_SETUP, variant: saved.variant } : DEFAULT_SETUP;
  if (!isValidSetup(saved)) return DEFAULT_SETUP;
  const { variant, difficulty, announcements, allTrumps, target } = saved;
  // A setup saved before the Klaverjas rule sets (US-214) plays the Amsterdam rules.
  const klaverjasRules = KLAVERJAS_RULES.includes(saved.klaverjasRules) ? saved.klaverjasRules : DEFAULT_SETUP.klaverjasRules;
  return { variant, difficulty, announcements, allTrumps, target, klaverjasRules };
}

// Storage may be blocked: the next setup then starts from the defaults.
export function saveSetup(storage: Store, mode: SetupMode, setup: Partial<Setup>): void {
  writeJson(storage, setupKey(mode), setup);
}

// Which parts of the sheet a mode shows.
export function setupBlocks(mode: SetupMode, variant: string) {
  const played = mode !== "crew";
  // Bela always plays its declarations ("zvanje"), so it has no switch for them (US-218); Klaberjass plays none (US-219), nor
  // does Klaverjas, whose roem is found in the tricks (US-213).
  return {
    seats: mode === "pass",
    owner: mode === "crew",
    bots: played,
    rules: played,
    announcements: played && variant !== "BELA" && variant !== "KLABERJASS" && variant !== "KLAVERJAS",
    allTrumps: played && variant === "CONTREE",
    klaverjasRules: played && variant === "KLAVERJAS"
  };
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
    target: values.target,
    ...(values.variant === "KLAVERJAS" ? { klaverjasRules: values.klaverjasRules } : {})
  };
  const names = values.seats.slice(0, seatCountOf(values.variant)).map(trimmedOrNull);
  return mode === "pass" ? { ...request, seats: names } : request;
}

const setupPaths: Record<SetupMode, string> = { solo: "/play/bot", pass: "/play/local", crew: "/online/private/new" };
const setupHomes: Record<SetupMode, string> = { solo: "/", pass: "/", crew: "/online/private" };
const submitLabels: Record<SetupMode, string> = { solo: "Deal the cards", pass: "Start pass and play", crew: "Create private table" };

export const setupPath = (mode: SetupMode) => setupPaths[mode];
export const setupHome = (mode: SetupMode) => setupHomes[mode];
export const submitLabel = (mode: SetupMode) => submitLabels[mode];
