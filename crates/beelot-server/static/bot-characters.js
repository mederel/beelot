// Maps the server's bot names to their characters, so a bot seat can draw its avatar from avatars.svg.
// Names are matched exactly (case-sensitive), as the server sends them; any other name has no character.

const BOT_CHARACTERS = new Map([
  ["Camille", "camille"],
  ["Luc", "luc"],
  ["Manon", "manon"],
  ["Hugo", "hugo"],
]);

// Returns `{ key, name }` for a bot name, or null for a human or unknown name.
function botCharacter(name) {
  const key = BOT_CHARACTERS.get(name);
  return key ? { key, name } : null;
}

if (typeof module !== "undefined") module.exports = { botCharacter };
