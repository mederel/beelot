// What the player is told about the connection (US-073, US-141, US-142, US-163): offline, a request or the live link in
// trouble with "Reconnect now" after ten seconds, and the line that counts the moves missed during a gap.
export const connection = $state({
  offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  trouble: false,
  reconnect: { visible: false, disabled: false },
  missed: null as { key: string; n: number } | null
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () => (connection.offline = false));
  window.addEventListener("offline", () => (connection.offline = true));
}

export function showConnectionTrouble(on: boolean): void {
  connection.trouble = on;
}
