// The table themes of Settings; "comic" is the default and needs no overrides in the stylesheet. The first four are
// always available (US-087); the others unlock by goals the player already has (US-148): none is bought and none
// changes play. Locks are derived from the goals ledger of goals.js, so a signed-in player's follow their statistics
// and a guest's the browser; an unlock is also remembered on the device, so a theme is not lost if the ledger is.
const THEMES = ["comic", "classic-green", "midnight", "sunset"];

// Each locked theme: the ledger total that unlocks it and the text that says how (an English key of the translations).
const LOCKED_THEMES = {
  forest: { total: "won", count: 1, hint: "Win your first match" },
  ruby: { total: "won", count: 10, hint: "Win 10 matches" },
  gilded: { total: "played", count: 25, hint: "Play 25 matches" }
};
const UNLOCKED_KEY = "beelot.unlocked-themes";

function resolveTheme(stored, unlocked = []) {
  if (THEMES.includes(stored)) return stored;
  return Object.hasOwn(LOCKED_THEMES, stored) && unlocked.includes(stored) ? stored : "comic";
}

// The locked themes the ledger's totals unlock, joined with the ones already remembered.
function unlockedThemes(ledger, remembered = []) {
  const earned = ledger
    ? Object.keys(LOCKED_THEMES).filter((theme) => ledger[LOCKED_THEMES[theme].total] >= LOCKED_THEMES[theme].count)
    : [];
  return Object.keys(LOCKED_THEMES).filter((theme) => earned.includes(theme) || remembered.includes(theme));
}

function readUnlockedThemes(storage) {
  try {
    const list = JSON.parse(storage.getItem(UNLOCKED_KEY));
    return Array.isArray(list) ? list.filter((theme) => Object.hasOwn(LOCKED_THEMES, theme)) : [];
  } catch (_) {
    return [];
  }
}

function saveUnlockedThemes(storage, themes) {
  try {
    storage.setItem(UNLOCKED_KEY, JSON.stringify(themes));
  } catch (_) { /* the unlocks last for this page only */ }
}

if (typeof module !== "undefined") {
  module.exports = { resolveTheme, THEMES, LOCKED_THEMES, UNLOCKED_KEY, unlockedThemes, readUnlockedThemes, saveUnlockedThemes };
}
