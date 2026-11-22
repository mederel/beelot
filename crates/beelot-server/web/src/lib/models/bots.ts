// Maps the server's bot names to their characters, so a bot seat can draw its avatar. Names are matched exactly, as the
// server sends them; any other name has no character.
export type BotKey = "camille" | "luc" | "manon" | "hugo";

const BOT_CHARACTERS = new Map<string, BotKey>([
  ["Camille", "camille"],
  ["Luc", "luc"],
  ["Manon", "manon"],
  ["Hugo", "hugo"]
]);

export function botCharacter(name: string | null | undefined): { key: BotKey; name: string } | null {
  const key = name ? BOT_CHARACTERS.get(name) : undefined;
  return key ? { key, name: name! } : null;
}

export const isBotName = (name: string | null | undefined) => botCharacter(name) !== null;

// The bots of each difficulty (the setup sheet shows their faces).
export const BOT_KEYS: BotKey[] = ["camille", "luc", "manon", "hugo"];
