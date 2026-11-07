// Tells the player when the connection is gone (US-073) and registers the offline shell.
function updateOfflineNote() {
  document.querySelector("#offline-note").hidden = navigator.onLine;
}

if (typeof document !== "undefined") {
  window.addEventListener("online", updateOfflineNote);
  window.addEventListener("offline", updateOfflineNote);
  updateOfflineNote();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}
