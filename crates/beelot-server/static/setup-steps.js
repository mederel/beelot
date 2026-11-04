// The bot game setup (US-105) is a form in three short steps.
const SETUP_STEPS = 3;

function moveSetupStep(step, delta, total = SETUP_STEPS) {
  return Math.min(total, Math.max(1, step + delta));
}

if (typeof module !== "undefined") module.exports = { SETUP_STEPS, moveSetupStep };
