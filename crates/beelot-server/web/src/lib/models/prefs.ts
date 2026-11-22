// The player's preferences that change how the table looks and moves, with no DOM: the pace of the bots and animations
// (US-147), the effects level (US-087), the table themes and their unlocks (US-087, US-148) and the tutorial banner
// (US-104). Every value is stored on the device under the same `beelot.*` keys as before US-198.
import { KEYS, readJson, writeJson, type Store } from "$lib/storage";
import type { Ledger } from "./goals";

export const PACES = { relaxed: 1.5, normal: 1, quick: 0.5 } as const;
export type Pace = keyof typeof PACES;
export const DEFAULT_PACE: Pace = "normal";

// The base delays, in milliseconds, at the normal pace. "Quick" shortens the pauses, it never removes one.
export const BASE_DELAYS = {
  biddingThink: 900,
  biddingReveal: 1900,
  ownCall: 1000,
  trickReveal: 650,
  trickHold: 1800,
  trickCollect: 520,
  dealFlight: 340,
  dealGap: 140
} as const;
export type DelayName = keyof typeof BASE_DELAYS;

export function resolvePace(stored: string | null | undefined): Pace {
  return stored && Object.hasOwn(PACES, stored) ? (stored as Pace) : DEFAULT_PACE;
}

export function paceDelay(name: DelayName, pace: string | null | undefined): number {
  if (!Object.hasOwn(BASE_DELAYS, name)) throw new Error(`unknown delay: ${name}`);
  return Math.round(BASE_DELAYS[name] * PACES[resolvePace(pace)]);
}

export const EFFECT_LEVELS = ["full", "reduced", "off"] as const;
export type EffectsLevel = (typeof EFFECT_LEVELS)[number];

// The level from what the player chose. The system's reduce-motion preference is not read: a table that moves less has
// been set so by the player (an explicit choice, or the older "reduce motion" setting of this browser).
export function resolveEffectsLevel(stored: string | null | undefined, legacyReducedMotion: string | null | undefined): EffectsLevel {
  if ((EFFECT_LEVELS as readonly string[]).includes(stored ?? "")) return stored as EffectsLevel;
  return legacyReducedMotion === "true" ? "reduced" : "full";
}

// The themes always available; the others unlock by goals the player already has. None is bought and none changes play.
export const THEMES = ["comic", "classic-green", "midnight", "sunset"] as const;
export const LOCKED_THEMES: Record<string, { total: "won" | "played"; count: number; hint: string }> = {
  forest: { total: "won", count: 1, hint: "Win your first match" },
  ruby: { total: "won", count: 10, hint: "Win 10 matches" },
  gilded: { total: "played", count: 25, hint: "Play 25 matches" }
};
export const ALL_THEMES = [...THEMES, ...Object.keys(LOCKED_THEMES)];
export const UNLOCKED_KEY = KEYS.unlockedThemes;

// The names the redesign gives the themes (US-198); the keys stay, so stored choices, unlocks and music still match.
export const THEME_NAMES: Record<string, string> = {
  comic: "Hive",
  "classic-green": "Club",
  midnight: "Neon",
  sunset: "Dusk",
  forest: "Grove",
  ruby: "Velvet",
  gilded: "Gilded"
};

export function resolveTheme(stored: string | null | undefined, unlocked: string[] = []): string {
  if ((THEMES as readonly string[]).includes(stored ?? "")) return stored as string;
  return stored && Object.hasOwn(LOCKED_THEMES, stored) && unlocked.includes(stored) ? stored : "comic";
}

// The locked themes the ledger's totals unlock, joined with the ones already remembered.
export function unlockedThemes(ledger: Ledger | null | undefined, remembered: string[] = []): string[] {
  const earned = ledger ? Object.keys(LOCKED_THEMES).filter((theme) => ledger[LOCKED_THEMES[theme].total] >= LOCKED_THEMES[theme].count) : [];
  return Object.keys(LOCKED_THEMES).filter((theme) => earned.includes(theme) || remembered.includes(theme));
}

export function readUnlockedThemes(storage: Store): string[] {
  return readJson(storage, UNLOCKED_KEY, [], Array.isArray).filter((theme) => Object.hasOwn(LOCKED_THEMES, theme));
}

// A storage that is unavailable keeps the unlocks for this page only.
export function saveUnlockedThemes(storage: Store, themes: string[]): void {
  writeJson(storage, UNLOCKED_KEY, themes);
}

export const TUTORIAL_SEEN_KEY = KEYS.tutorialSeen;

export function shouldShowTutorialBanner({ seen, signedIn }: { seen: boolean; signedIn: boolean }): boolean {
  return !seen && !signedIn;
}

// Storage can be blocked (private mode): then the tutorial simply counts as not seen.
export function tutorialSeen(storage: Store): boolean {
  try {
    return storage.getItem(TUTORIAL_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage: Store): void {
  try {
    storage.setItem(TUTORIAL_SEEN_KEY, "true");
  } catch {
    // Nothing to do: the banner may come back on the next visit.
  }
}
