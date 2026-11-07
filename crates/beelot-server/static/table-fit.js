// Keeps the player stations clear of the cards of the current trick (US-126): the stations shrink in steps before the
// cards do. Pure geometry; the DOM measuring is in app-layout.js.
const STATION_LEVELS = ["", "stations-compact", "stations-minimal", "stations-low"];

function boxesIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// The first level at which no station touches a card; the smallest level when none does. `measure(level)` answers
// `{ stations: [box], cards: [box] }` as the table is laid out at that level.
function chooseStationLevel(measure, levels = STATION_LEVELS) {
  for (const level of levels) {
    const { stations, cards } = measure(level);
    if (!stations.some((station) => cards.some((card) => boxesIntersect(station, card)))) return level;
  }
  return levels[levels.length - 1];
}

if (typeof module !== "undefined") module.exports = { STATION_LEVELS, boxesIntersect, chooseStationLevel };
