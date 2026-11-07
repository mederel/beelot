// Table layout upkeep (US-126): after the trick or the window changes, the stations shrink until they clear the cards.
const stationBox = (element) => {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return { left, right, top, bottom };
};

function fitStations(table) {
  if (!table.offsetParent) return;
  const level = chooseStationLevel((candidate) => {
    table.classList.remove(...STATION_LEVELS.filter(Boolean));
    if (candidate) table.classList.add(candidate);
    return {
      stations: [...table.querySelectorAll(".player-station")].filter((item) => item.children.length).map(stationBox),
      cards: [...table.querySelectorAll(".trick-slot .playing-card")].map(stationBox)
    };
  });
  table.classList.remove(...STATION_LEVELS.filter(Boolean));
  if (level) table.classList.add(level);
}

let fitFrame = 0;
function scheduleStationFit() {
  window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(() => document.querySelectorAll(".card-table").forEach(fitStations));
}

const fitObserver = new MutationObserver(scheduleStationFit);
document.querySelectorAll(".card-table .current-trick").forEach((trick) => fitObserver.observe(trick, { childList: true, subtree: true }));
document.querySelectorAll(".card-table .player-station").forEach((station) => fitObserver.observe(station, { childList: true }));
window.addEventListener("resize", scheduleStationFit);
