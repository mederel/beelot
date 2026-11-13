// Tells the player when the connection is gone (US-073) and registers the offline shell.
function updateOfflineNote() {
  document.querySelector("#offline-note").hidden = navigator.onLine;
}

// A request failed for lack of an answer, or answered again (US-141): the note tells the player the game is retrying.
function showConnectionTrouble(on) {
  const note = document.querySelector("#connection-note");
  if (note) note.hidden = !on;
}

if (typeof document !== "undefined") {
  window.addEventListener("online", updateOfflineNote);
  window.addEventListener("offline", updateOfflineNote);
  updateOfflineNote();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}
