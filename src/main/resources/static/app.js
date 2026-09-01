const pathToView = {
  "/": "home",
  "/index.html": "home",
  "/play/ai": "ai",
  "/online/private": "private",
  "/tutorial": "tutorial",
  "/rules": "rules"
};

function viewForPath(path) {
  return path.startsWith("/play/ai/game/") ? "ai-game" : (pathToView[path] ?? "home");
}

function renderView() {
  const activeView = viewForPath(window.location.pathname);
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
  });
  document.title = activeView === "home"
    ? "Beelot — Play Belote"
    : `${document.querySelector(`[data-view="${activeView}"] h1`).textContent} — Beelot`;

  if (activeView === "ai-game") {
    loadAiGame(window.location.pathname.split("/").at(-1));
  }
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
    item.innerHTML = `<strong>${seat.name}</strong><span>${seat.type === "HUMAN" ? "You" : "AI opponent"}</span>`;
    return item;
  }));
}

document.querySelector("#ai-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const response = await fetch("/api/ai-games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: form.get("difficulty") })
  });

  if (!response.ok) {
    return;
  }

  const game = await response.json();
  window.history.pushState({}, "", `/play/ai/game/${game.id}`);
  document.querySelector("#selected-difficulty").textContent = game.difficultyLabel;
  document.querySelector("#seat-list").replaceChildren(...game.seats.map((seat) => {
    const item = document.createElement("div");
    item.className = "seat";
    item.innerHTML = `<strong>${seat.name}</strong><span>${seat.type === "HUMAN" ? "You" : "AI opponent"}</span>`;
    return item;
  }));
  renderView();
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) {
    return;
  }

  const destination = new URL(link.href).pathname;
  if (!(destination in pathToView)) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", destination);
  renderView();
});

window.addEventListener("popstate", renderView);
renderView();
