// What to ask before the player leaves a table (US-110): nothing once the match is over or when no table is being
// played, otherwise a title and what will happen, as English texts to translate.
function leaveConfirmation({ kind, matchComplete }) {
  if (!kind || matchComplete) return null;
  return {
    title: "Leave this table?",
    message: kind === "online"
      ? "If you stay away, a bot will take over your seat."
      : "The game will be abandoned."
  };
}

if (typeof module !== "undefined") module.exports = { leaveConfirmation };
