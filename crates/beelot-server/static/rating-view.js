// The rating on the statistics page (US-068): what to show of `/api/ratings`. No DOM.
const PROVISIONAL_DEVIATION = 110;

// One row per variant: the rating, how sure it is, and whether it is still provisional (few matches played).
function ratingRows(ratings) {
  return (ratings ?? []).map((entry) => ({
    variant: entry.variant,
    rating: entry.rating,
    deviation: entry.deviation,
    matches: entry.matches,
    provisional: entry.deviation > PROVISIONAL_DEVIATION,
    history: entry.history ?? []
  }));
}

// The points of a polyline drawing the history in a width x height box: oldest on the left, the highest rating at the
// top. A single point is drawn as a flat line.
function sparklinePoints(history, width, height) {
  if (history.length === 0) return "";
  const values = history.map((point) => point.rating);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const margin = 3;
  return history
    .map((point, index) => {
      const x = history.length === 1 ? width / 2 : (index * width) / (history.length - 1);
      const y = history.length === 1 ? height / 2 : margin + (1 - (point.rating - low) / span) * (height - 2 * margin);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

if (typeof module !== "undefined") module.exports = { PROVISIONAL_DEVIATION, ratingRows, sparklinePoints };
