// The costly cards of a reviewed round (US-067): what the review says about them. No DOM.
// `analysis` is `/api/tables/{id}/analysis`: `{ complete, costly: [{ trick, position, played, best, pointsLost }] }`,
// undefined while it is being fetched and null when there is none (guests' online tables, an error).

// The costly cards of the trick shown at `step` (step n shows trick n; the deal, step 0, shows none).
function costlyAtStep(analysis, step) {
  if (!analysis || step < 1) return [];
  return analysis.costly.filter((entry) => entry.trick === step - 1);
}

// What the review says at the deal: that the cards are being analysed, how many cost points, or that none did.
function costlySummary(analysis) {
  if (analysis === undefined) return { text: "Analysing your cards…", values: [] };
  if (analysis === null) return null;
  if (analysis.costly.length === 0) {
    return { text: analysis.complete ? "No costly card: well played!" : "No costly card in the part analysed.", values: [] };
  }
  return { text: analysis.complete ? "Costly cards: {0}. Step through the tricks to see them." : "Costly cards found: {0}. The analysis is partial. Step through the tricks to see them.", values: [analysis.costly.length] };
}

// Why the bots played the cards of the trick shown at `step` (US-149): `explanations` is
// `/api/tables/{id}/explanations`, `[{ trick, position, seat, reason }]`, undefined while fetched and null when there
// is none. The result maps the place in the trick to the reason code; a card with no known reason has no entry, and
// a code the client does not know is left out rather than guessed.
function explanationsAtStep(explanations, step, knownReasons) {
  const found = new Map();
  if (!Array.isArray(explanations) || step < 1) return found;
  for (const entry of explanations) {
    if (entry.trick === step - 1 && Object.hasOwn(knownReasons, entry.reason)) found.set(entry.position, entry.reason);
  }
  return found;
}

if (typeof module !== "undefined") module.exports = { costlyAtStep, costlySummary, explanationsAtStep };
