// Short vibrations on phones that allow them (Android, the app; iOS has none): a card played, a trick won, a coinche.
// The Vibration switch of Settings (`beelot.vibration`, on by default) and the effects level "off" turn them off.
import { KEYS, local } from "$lib/storage";

export const vibrationSupported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrationEnabled(): boolean {
  return local.getItem(KEYS.vibration) !== "false";
}

export function setVibration(on: boolean): void {
  local.setItem(KEYS.vibration, String(on));
}

const PATTERNS = { card: 12, trick: [10, 40, 18], coinche: [30, 30, 50], win: [20, 50, 20, 50, 40], refuse: [8, 30, 8] } as const;

export function buzz(kind: keyof typeof PATTERNS): void {
  if (!vibrationSupported || !vibrationEnabled()) return;
  if (document.documentElement.dataset.effects === "off") return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    /* not allowed here */
  }
}
