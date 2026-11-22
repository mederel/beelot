// Short vibrations on phones that allow them (Android, the app; iOS has none): a card played, a trick won, a coinche.
// The Vibration switch of Settings (`beelot.vibration`, on by default) and the effects level "off" turn them off.
const VIBRATION_KEY = "beelot.vibration";

export const vibrationSupported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrationEnabled(): boolean {
  try {
    return localStorage.getItem(VIBRATION_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setVibration(on: boolean): void {
  try {
    localStorage.setItem(VIBRATION_KEY, String(on));
  } catch {
    /* the choice lasts for this page only */
  }
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
