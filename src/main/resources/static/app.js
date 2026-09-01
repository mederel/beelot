const pathToView = {
  "/": "home",
  "/index.html": "home",
  "/play/ai": "ai",
  "/online/private": "private",
  "/tutorial": "tutorial",
  "/rules": "rules"
};

function renderView() {
  const activeView = pathToView[window.location.pathname] ?? "home";
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
  });
  document.title = activeView === "home"
    ? "Beelot — Play Belote"
    : `${document.querySelector(`[data-view="${activeView}"] h1`).textContent} — Beelot`;
}

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
