// Everything Beelot keeps in the browser (US-194): the names of the keys, and reads and writes that survive a storage the
// browser disables (a private window, blocked site data) or fills. No other file calls `localStorage` or `sessionStorage`
// or writes a `beelot.*` name (a test checks), and the privacy policy lists these keys (a test checks that too).
//
// The names are the players' data: a browser that stored a choice under `beelot.theme` before this module existed still
// finds it there. A key is added here, then in the policy's "storage" section.

// On the device, kept between visits.
export const KEYS = {
  language: "beelot.language",
  soundEnabled: "beelot.sound-enabled",
  musicEnabled: "beelot.music-enabled",
  musicVolume: "beelot.music-volume",
  vibration: "beelot.vibration",
  theme: "beelot.theme",
  effects: "beelot.effects",
  // The older "reduce motion" setting: read when no effects level is stored, removed once the level is chosen.
  reducedMotion: "beelot.reduced-motion",
  pace: "beelot.pace",
  reactionsEnabled: "beelot.reactions-enabled",
  botComments: "beelot.bot-comments",
  unlockedThemes: "beelot.unlocked-themes",
  tutorialSeen: "beelot.tutorial-seen",
  // The goals' ledger of a guest, and the offer to create an account.
  goals: "beelot.goals",
  accountOffer: "beelot.account-offer",
  // The solo match and the online seats the player can resume: they hold the table id and the player token.
  resume: "beelot.resume",
  resumeOnline: "beelot.resume-online",
  // The solo setup of an earlier version, read when the new key is empty.
  legacySoloSetup: "beelot.bot-game"
} as const;

// The setup sheet's last choices, one key per mode.
export const setupKey = (mode: string): string => `beelot.setup.${mode}`;

// For this tab only.
export const SESSION_KEYS = {
  tableTokens: "beelot.table-tokens",
  privateTableSession: "beelot.private-table-session",
  greeted: "beelot.greeted"
} as const;

export const LOCAL_KEYS: string[] = Object.values(KEYS);

// What the helpers of the models need from a storage: the browser's, or a stand-in in a test.
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): void;
}

function area(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

// The browser's storage, looked up on every use: a choice that cannot be read is absent, one that cannot be written lasts
// for the page only.
function browser(name: "localStorage" | "sessionStorage"): Store {
  return {
    getItem(key) {
      try {
        return area(name)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        area(name)?.setItem(key, value);
        return true;
      } catch {
        /* disabled or full: the value lasts for this page only */
        return false;
      }
    },
    removeItem(key) {
      try {
        area(name)?.removeItem(key);
      } catch {
        /* disabled: nothing to remove */
      }
    }
  };
}

export const local: Store = browser("localStorage");
export const session: Store = browser("sessionStorage");

// A stored JSON value. A missing, corrupt or unreadable one, or one that `valid` refuses, gives `fallback`.
export function readJson<T, F = T>(store: Store, key: string, fallback: F, valid?: (value: unknown) => value is T): T | F {
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid && !valid(value) ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

// Says whether the value was kept: false when the storage is disabled or full.
export function writeJson(store: Store, key: string, value: unknown): boolean {
  try {
    return store.setItem(key, JSON.stringify(value)) !== false;
  } catch {
    return false;
  }
}
