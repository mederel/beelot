// Choosing the display name (US-072): the same rules as any player name, checked before the request. No DOM.
const MAX_DISPLAY_NAME = 30;

// The name to send, or the message to show. Characters are counted as people see them, not as UTF-16 units.
function checkDisplayName(raw) {
  const name = raw.trim();
  if (name === "") return { ok: false, message: "Enter a player name." };
  if ([...name].length > MAX_DISPLAY_NAME) return { ok: false, message: "Player names are limited to 30 characters." };
  return { ok: true, name };
}

if (typeof module !== "undefined") module.exports = { MAX_DISPLAY_NAME, checkDisplayName };
