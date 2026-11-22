// A message for the page the player is sent to, such as "That table is no longer available." on Crew or Find a game.
const state = $state({ path: "", text: "" });

export const notices = {
  set(path: string, text: string): void {
    state.path = path;
    state.text = text;
  },
  // The message for this page, once.
  take(path: string): string {
    if (state.path !== path) return "";
    const text = state.text;
    state.path = "";
    state.text = "";
    return text;
  }
};
