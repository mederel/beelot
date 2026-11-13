// The pace of the bots and of the animations (US-147): every pause of the table is one base delay times the factor of
// the chosen pace. No DOM. "Quick" shortens the pauses, it never removes one: each call and card still appears before
// the next, in order. Reduced motion keeps its own rule (it skips the deal's flight) and does not depend on the pace.
const PACES = { relaxed: 1.5, normal: 1, quick: 0.5 };
const DEFAULT_PACE = "normal";

// The base delays, in milliseconds, at the normal pace.
const BASE_DELAYS = {
  biddingThink: 900,
  biddingReveal: 1900,
  ownCall: 1000,
  trickReveal: 650,
  trickHold: 1800,
  trickCollect: 520,
  dealFlight: 340,
  dealGap: 140
};

function resolvePace(stored) {
  return Object.hasOwn(PACES, stored) ? stored : DEFAULT_PACE;
}

function paceDelay(name, pace) {
  if (!Object.hasOwn(BASE_DELAYS, name)) throw new Error(`unknown delay: ${name}`);
  return Math.round(BASE_DELAYS[name] * PACES[resolvePace(pace)]);
}

if (typeof module !== "undefined") module.exports = { PACES, DEFAULT_PACE, BASE_DELAYS, resolvePace, paceDelay };
