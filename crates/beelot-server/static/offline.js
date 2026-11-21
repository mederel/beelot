// Tells the player when the connection is gone (US-073) and registers the offline shell.
import { reconnectNow } from "./app-core.js";
import { t } from "./i18n.js";

function updateOfflineNote() {
  document.querySelector("#offline-note").hidden = navigator.onLine;
}

// A request failed for lack of an answer, or answered again (US-141): the note tells the player the game is retrying.
function showConnectionTrouble(on) {
  const note = document.querySelector("#connection-note");
  if (note) note.hidden = !on;
}

// The "Reconnect now" button of the note (US-163): shown after ten seconds of a dropped stream, disabled while it tries.
function showReconnectButton(visible, disabled) {
  const button = document.querySelector("#connection-reconnect");
  if (!button) return;
  button.hidden = !visible;
  button.disabled = Boolean(disabled);
}

// The line that counts the moves missed during a gap; `line` is `{ key, n }` from missedLine(), or null to hide it.
function showMissedLine(line) {
  const element = document.querySelector("#missed-moves");
  if (!element) return;
  // Out of `hidden` first, then the text: a live region is announced when its text changes while it is in the page.
  element.hidden = !line;
  element.textContent = line ? t(line.key).replace("{n}", line.n) : "";
}

if (typeof document !== "undefined") {
  document.querySelector("#connection-reconnect")?.addEventListener("click", reconnectNow);
  window.addEventListener("online", updateOfflineNote);
  window.addEventListener("offline", updateOfflineNote);
  updateOfflineNote();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

export { showConnectionTrouble, showReconnectButton, showMissedLine };
