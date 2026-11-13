// The daily deal (US-150): the card of home that starts it, and its board in the Leaderboard view.
// One of the plain scripts that make up the app (they share one global scope and load in the order of index.html).

// The day's information, or null where there is no daily deal (the server has no secret) or it cannot be reached.
async function fetchDaily(day) {
  try {
    return await apiJson(`/api/daily?day=${day}`);
  } catch (_) {
    return null;
  }
}

async function loadDailyCard() {
  const card = document.querySelector("#daily-card");
  card.hidden = true;
  const info = await fetchDaily("today");
  if (!info || viewForPath(window.location.pathname) !== "home") return;
  const model = dailyCard(info);
  document.querySelector("#daily-detail").textContent = t("{0} · {1}", t(model.variantKey), t(model.detail, ...model.values));
  card.classList.toggle("resume-card-done", !model.canStart);
  card.dataset.canStart = String(model.canStart);
  card.hidden = false;
}

document.querySelector("#daily-card").addEventListener("click", async (event) => {
  event.preventDefault();
  const card = event.currentTarget;
  if (card.dataset.canStart !== "true") return;
  const message = document.querySelector("#play-now-message");
  message.textContent = "";
  try {
    const access = await api.startDaily();
    lastDealKey = "";
    navigate(`/play/bot/bidding/${access.tableId}`);
  } catch (error) {
    message.textContent = error.message;
    loadDailyCard();
  }
});

// The board of the Leaderboard view, for today or yesterday; hidden altogether where there is no daily deal.
async function loadDailyBoard() {
  const section = document.querySelector("#daily-board");
  const day = choiceValue("daily-day") ?? "today";
  const info = await fetchDaily(day);
  section.hidden = !info;
  if (!info) return;
  const mine = document.querySelector("#daily-mine");
  const note = dailyMineNote(info.mine);
  mine.textContent = note ? t(note.text, ...note.values.map((value) => formatNumber(value))) : "";
  mine.hidden = !note;
  const table = document.querySelector("#daily-table");
  document.querySelector("#daily-empty").hidden = info.rows.length > 0;
  table.hidden = info.rows.length === 0;
  if (info.rows.length) tableRows(table, ["#", "Player", "Score"], dailyRows(info.rows).map((row) => row.map((value, index) => (index === 1 ? value : formatNumber(value)))));
}

choiceInputs("daily-day").forEach((input) => input.addEventListener("change", loadDailyBoard));
