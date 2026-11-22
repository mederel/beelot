// The two live regions of the page (US-074): the game as it goes on, and the match score when its sentence changes.
export const live = $state({ game: "", score: "" });

export function announce(text: string): void {
  if (!text) return;
  // The same sentence twice in a row is spoken again: clear it first.
  live.game = "";
  queueMicrotask(() => (live.game = text));
}
