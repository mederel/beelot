const pathToView = {
  "/": "home",
  "/index.html": "home",
  "/play/ai": "ai",
  "/online/private": "private",
  "/tutorial": "tutorial",
  "/rules": "rules"
};
const privateSessionKey = "beelot.private-table-session";

function viewForPath(path) {
  if (path.startsWith("/play/ai/game/")) return "ai-game";
  if (path.startsWith("/online/private/table/")) return "private-table";
  return pathToView[path] ?? "home";
}

function privateTableId() {
  return window.location.pathname.split("/").at(-1);
}

function getPrivateSession() {
  const stored = window.sessionStorage.getItem(privateSessionKey);
  return stored ? JSON.parse(stored) : null;
}

function renderView() {
  const activeView = viewForPath(window.location.pathname);
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
  });
  document.title = activeView === "home"
    ? "Beelot — Play Belote"
    : `${document.querySelector(`[data-view="${activeView}"] h1`).textContent} — Beelot`;

  if (activeView === "ai-game") loadAiGame(window.location.pathname.split("/").at(-1));
  if (activeView === "private-table") loadPrivateTable(privateTableId());
}

function createSeat(seat, currentPlayerId) {
  const item = document.createElement("div");
  item.className = "seat";
  const name = document.createElement("strong");
  name.textContent = seat.playerId === currentPlayerId ? `${seat.name} (you)` : seat.name;
  const state = document.createElement("span");
  state.textContent = seat.ready ? "Ready" : "Waiting";
  item.append(name, state);
  return item;
}

function showPrivateTable(table) {
  const session = getPrivateSession();
  const currentPlayerId = session?.tableId === table.id ? session.playerId : null;
  const currentSeat = table.seats.find((seat) => seat.playerId === currentPlayerId);
  const isOwner = currentPlayerId === table.ownerPlayerId;
  const allReady = table.seats.length === 4 && table.seats.every((seat) => seat.ready);

  document.querySelector("#private-invitation-code").textContent = table.invitationCode;
  document.querySelector("#private-table-status").textContent = table.status === "IN_PROGRESS" ? "Game started" : "Private table";
  document.querySelector("#private-seat-list").replaceChildren(...table.seats.map((seat) => createSeat(seat, currentPlayerId)));
  const readyButton = document.querySelector("#ready-button");
  readyButton.hidden = !currentSeat || table.status === "IN_PROGRESS";
  readyButton.textContent = currentSeat?.ready ? "Not ready" : "I am ready";
  const startButton = document.querySelector("#start-private-game-button");
  startButton.hidden = !isOwner || table.status === "IN_PROGRESS";
  startButton.disabled = !allReady;
  document.querySelector("#private-table-message").textContent = table.status === "IN_PROGRESS"
    ? "The game has started. The game table will be added in the next story."
    : "";
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "Something went wrong. Please try again.");
  return body;
}

async function loadPrivateTable(tableId) {
  try {
    showPrivateTable(await apiJson(`/api/private-tables/${tableId}`));
  } catch (error) {
    window.history.replaceState({}, "", "/online/private");
    document.querySelector("#private-form-message").textContent = "That table is no longer available.";
    renderView();
  }
}

function enterPrivateTable(session) {
  window.sessionStorage.setItem(privateSessionKey, JSON.stringify({
    tableId: session.table.id,
    playerId: session.playerId,
    playerToken: session.playerToken
  }));
  window.history.pushState({}, "", `/online/private/table/${session.table.id}`);
  showPrivateTable(session.table);
  renderView();
}

async function loadAiGame(gameId) {
  const response = await fetch(`/api/ai-games/${gameId}`);
  if (!response.ok) {
    window.history.replaceState({}, "", "/play/ai");
    renderView();
    return;
  }

  const game = await response.json();
  document.querySelector("#selected-difficulty").textContent = game.difficultyLabel;
  document.querySelector("#seat-list").replaceChildren(...game.seats.map((seat) => {
    const item = document.createElement("div");
    item.className = "seat";
    item.textContent = `${seat.name} — ${seat.type === "HUMAN" ? "You" : "AI opponent"}`;
    return item;
  }));
}

document.querySelector("#ai-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const game = await apiJson("/api/ai-games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: form.get("difficulty") })
  });
  window.history.pushState({}, "", `/play/ai/game/${game.id}`);
  renderView();
});

document.querySelector("#create-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const session = await apiJson("/api/private-tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: new FormData(event.currentTarget).get("playerName") })
    });
    enterPrivateTable(session);
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#join-private-table-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const session = await apiJson("/api/private-tables/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: form.get("playerName"), invitationCode: form.get("invitationCode") })
    });
    enterPrivateTable(session);
  } catch (error) {
    document.querySelector("#private-form-message").textContent = error.message;
  }
});

document.querySelector("#ready-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  const seat = document.querySelectorAll("#private-seat-list .seat");
  if (!session || session.tableId !== tableId || !seat) return;
  const currentReady = document.querySelector("#ready-button").textContent === "Not ready";
  try {
    showPrivateTable(await apiJson(`/api/private-tables/${tableId}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken, ready: !currentReady })
    }));
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#start-private-game-button").addEventListener("click", async () => {
  const session = getPrivateSession();
  const tableId = privateTableId();
  if (!session || session.tableId !== tableId) return;
  try {
    showPrivateTable(await apiJson(`/api/private-tables/${tableId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken: session.playerToken })
    }));
  } catch (error) {
    document.querySelector("#private-table-message").textContent = error.message;
  }
});

document.querySelector("#copy-invitation-code").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.querySelector("#private-invitation-code").textContent);
  document.querySelector("#copy-invitation-code").textContent = "Copied";
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) return;
  const destination = new URL(link.href).pathname;
  if (!(destination in pathToView)) return;
  event.preventDefault();
  window.history.pushState({}, "", destination);
  renderView();
});

window.addEventListener("popstate", renderView);
window.setInterval(() => {
  if (viewForPath(window.location.pathname) === "private-table") loadPrivateTable(privateTableId());
}, 3000);
renderView();
