// The player's settings, kept on the device under the same keys as before US-198 (`beelot.*`), so nobody loses a choice.
// Blocked storage keeps a choice for the page only. The look follows them through attributes on <html>: `data-effects`,
// `data-pace` and `data-theme`, which the stylesheet and the components read.
import { sfx } from "$lib/audio/sfx";
import { MUSIC_KEY, MUSIC_VOLUME_KEY, musicEnabled, musicVolumeLevel, type MusicVolume } from "$lib/audio/music";
import { setVibration, vibrationEnabled } from "$lib/fx/haptics";
import { readUnlockedThemes, resolveEffectsLevel, resolvePace, resolveTheme, saveUnlockedThemes, type EffectsLevel, type Pace } from "$lib/models/prefs";
import { paceDelay, type DelayName } from "$lib/models/prefs";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the choice lasts for this page only */
  }
}

const unlocked = readUnlockedThemes(globalThis.localStorage as Storage);

export const settings = $state({
  effects: resolveEffectsLevel(read("beelot.effects"), read("beelot.reduced-motion")) as EffectsLevel,
  pace: resolvePace(read("beelot.pace")) as Pace,
  theme: resolveTheme(read("beelot.theme"), unlocked),
  unlocked,
  sound: read("beelot.sound-enabled") !== "false",
  music: musicEnabled(read(MUSIC_KEY)),
  musicVolume: musicVolumeLevel(read(MUSIC_VOLUME_KEY)) as MusicVolume,
  reactions: read("beelot.reactions-enabled") !== "false",
  botComments: read("beelot.bot-comments") !== "false",
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
  write("beelot.effects", level);
  try {
    localStorage.removeItem("beelot.reduced-motion");
  } catch {
    /* nothing to remove */
  }
  applySettings();
}

export function setPace(pace: Pace): void {
  settings.pace = pace;
  write("beelot.pace", pace);
  applySettings();
}

export function setTheme(theme: string): void {
  settings.theme = resolveTheme(theme, settings.unlocked);
  write("beelot.theme", settings.theme);
  applySettings();
}

export function setUnlocked(themes: string[]): void {
  settings.unlocked = themes;
  saveUnlockedThemes(localStorage, themes);
  settings.theme = resolveTheme(read("beelot.theme") ?? settings.theme, themes);
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
  write("beelot.reactions-enabled", String(on));
}

export function setBotComments(on: boolean): void {
  settings.botComments = on;
  write("beelot.bot-comments", String(on));
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
