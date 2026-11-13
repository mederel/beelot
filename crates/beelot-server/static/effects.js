// Decides the effects level ("full", "reduced" or "off") from what the player chose in Settings. Animations are never
// skipped on the system's behalf: the system's reduce-motion preference is not read, so a table that looks different
// has been set so by the player (an explicit choice, or the older "reduce motion" setting of this browser).
const EFFECT_LEVELS = ["full", "reduced", "off"];

function resolveEffectsLevel(stored, legacyReducedMotion) {
  if (EFFECT_LEVELS.includes(stored)) return stored;
  return legacyReducedMotion === "true" ? "reduced" : "full";
}

if (typeof module !== "undefined") module.exports = { resolveEffectsLevel };
