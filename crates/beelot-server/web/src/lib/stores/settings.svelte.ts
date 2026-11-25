// The player's settings, kept on the device under the same keys as before US-198 (`beelot.*`), so nobody loses a choice.
// Blocked storage keeps a choice for the page only. The look follows them through attributes on <html>: `data-effects`,
// `data-pace` and `data-theme`, which the stylesheet and the components read.
import { sfx } from "$lib/audio/sfx";
import { KEYS, local } from "$lib/storage";
import { MUSIC_KEY, MUSIC_VOLUME_KEY, musicEnabled, musicVolumeLevel, type MusicVolume } from "$lib/audio/music";
import { setVibration, vibrationEnabled } from "$lib/fx/haptics";
import { readUnlockedThemes, resolveEffectsLevel, resolvePace, resolveTheme, saveUnlockedThemes, type EffectsLevel, type Pace } from "$lib/models/prefs";
import { paceDelay, type DelayName } from "$lib/models/prefs";

const read = (key: string): string | null => local.getItem(key);
const write = (key: string, value: string): void => void local.setItem(key, value);

const unlocked = readUnlockedThemes(local);

/** The system asks for less motion (the page may be loaded where matchMedia does not exist: a test, a worker). */
function systemReducesMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const settings = $state({
  effects: resolveEffectsLevel(read(KEYS.effects), read(KEYS.reducedMotion), systemReducesMotion()) as EffectsLevel,
  pace: resolvePace(read(KEYS.pace)) as Pace,
  theme: resolveTheme(read(KEYS.theme), unlocked),
  unlocked,
  sound: read(KEYS.soundEnabled) !== "false",
  music: musicEnabled(read(MUSIC_KEY)),
  musicVolume: musicVolumeLevel(read(MUSIC_VOLUME_KEY)) as MusicVolume,
  reactions: read(KEYS.reactionsEnabled) !== "false",
  botComments: read(KEYS.botComments) !== "false",
  vibration: vibrationEnabled()
});

export function applySettings(): void {
  const root = document.documentElement;
  root.dataset.effects = settings.effects;
  root.dataset.pace = settings.pace;
  root.dataset.theme = settings.theme;
}

export function setEffects(level: EffectsLevel): void {
  settings.effects = level;
  write(KEYS.effects, level);
  try {
    local.removeItem(KEYS.reducedMotion);
  } catch {
    /* nothing to remove */
  }
  applySettings();
}

export function setPace(pace: Pace): void {
  settings.pace = pace;
  write(KEYS.pace, pace);
  applySettings();
}

export function setTheme(theme: string): void {
  settings.theme = resolveTheme(theme, settings.unlocked);
  write(KEYS.theme, settings.theme);
  applySettings();
}

export function setUnlocked(themes: string[]): void {
  settings.unlocked = themes;
  saveUnlockedThemes(local, themes);
  settings.theme = resolveTheme(read(KEYS.theme) ?? settings.theme, themes);
  applySettings();
}

export function setSound(on: boolean): void {
  settings.sound = on;
  sfx.setEnabled(on);
}

export function setMusic(on: boolean): void {
  settings.music = on;
  write(MUSIC_KEY, String(on));
}

export function setMusicVolume(level: MusicVolume): void {
  settings.musicVolume = level;
  write(MUSIC_VOLUME_KEY, level);
}

export function setReactions(on: boolean): void {
  settings.reactions = on;
  write(KEYS.reactionsEnabled, String(on));
}

export function setBotComments(on: boolean): void {
  settings.botComments = on;
  write(KEYS.botComments, String(on));
}

export function setVibrationSetting(on: boolean): void {
  settings.vibration = on;
  setVibration(on);
}

// A pause of the table, scaled by the pace chosen in Settings (US-147).
export function paced(name: DelayName): number {
  return paceDelay(name, settings.pace);
}

// "full", "reduced" or "off": motion that travels only at full; fades at reduced; nothing at off.
export const motionFull = () => settings.effects === "full";
export const motionReduced = () => settings.effects !== "full";
