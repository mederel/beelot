// Small goals and streaks (US-113) and the themes they unlock (US-148). A guest's ledger lives on the device; a signed-in
// player's comes from their statistics (null while unknown: no goal is shown or celebrated then).
import { local } from "$lib/storage";
import { apiJson } from "$lib/api/client";
import { sfx } from "$lib/audio/sfx";
import { t } from "$lib/i18n/i18n.svelte";
import { goalCelebration, goalMessage, goalSummary, ledgerFromStatistics, loadLedger, recordResult, saveLedger, type Ledger } from "$lib/models/goals";
import { THEME_NAMES, unlockedThemes } from "$lib/models/prefs";
import { announce } from "./live.svelte";
import { setUnlocked, settings } from "./settings.svelte";

export const goals = $state({ ledger: null as Ledger | null, signedIn: false, unlockedNow: "" as string });

const outcomes = new Map<string, { celebration: "firstWin" | "firstGame" | null; message: string }>();

export function goalText(ledger: Ledger | null = goals.ledger): string {
  if (!ledger) return "";
  const { key, args } = goalMessage(goalSummary(ledger));
  return t(key, ...args);
}

// Unlocks what the totals now earn, remembers it, and says so for a new unlock.
function refreshThemeUnlocks(): void {
  const now = unlockedThemes(goals.ledger, settings.unlocked);
  const added = now.filter((theme) => !settings.unlocked.includes(theme));
  if (!added.length) return;
  setUnlocked(now);
  goals.unlockedNow = added[0];
  sfx.play("unlock");
  announce(t("New theme unlocked: {0}", t(THEME_NAMES[added[0]])));
}

export async function loadGoals(signedIn: boolean): Promise<void> {
  goals.signedIn = signedIn;
  goals.ledger = signedIn ? await apiJson("/api/statistics").then(ledgerFromStatistics, () => null) : loadLedger(local);
  if (goals.ledger) refreshThemeUnlocks();
}

// What a finished match adds to the goals, once per match. A guest's result is added on the device; a signed-in player's is
// recorded by the server, so it is only previewed and the statistics are fetched again a moment later. `live` is false when
// the player comes back to a match that ended before: nothing is celebrated then.
export function goalOutcome(signature: string, won: boolean, live: boolean) {
  if (outcomes.has(signature)) return outcomes.get(signature)!;
  const ledger = goals.ledger;
  if (!ledger) return null;
  const after = recordResult(ledger, signature, won);
  const outcome = {
    celebration: live && !ledger.seen.includes(signature) ? goalCelebration(ledger, won) : null,
    message: goalText(goals.signedIn && !live ? ledger : after)
  };
  outcomes.set(signature, outcome);
  if (!goals.signedIn) {
    goals.ledger = after;
    saveLedger(local, after);
    refreshThemeUnlocks();
  } else if (live) {
    window.setTimeout(() => loadGoals(true), 1500);
  }
  return outcome;
}
