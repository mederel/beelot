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

if (typeof module !== "undefined") module.exports = { costlyAtStep, costlySummary };
