// The one status line of the table header (US-106). It returns the English text to translate and the player names
// to put in it; the caller translates the text and formats the names.
function tableStatus({ phase, complete, roundOver, dealing, reviewingTrick, trickWinner, myTurn, activeName, passAndPlay }) {
  if (phase === "bidding" && complete) return { text: "The auction is over", args: [] };
  if (phase === "play") {
    if (roundOver) return { text: "Round over", args: [] };
    if (dealing) return { text: "Dealing the remaining cards…", args: [] };
    if (reviewingTrick) return { text: "{0} takes the trick", args: [trickWinner] };
  }
  const verb = phase === "bidding" ? "bid" : "play";
  if (!myTurn) return { text: "{0} is thinking…", args: [activeName] };
  // On a shared device "You" is ambiguous: name the player who holds it.
  return passAndPlay
    ? { text: `{0}, your turn to ${verb}`, args: [activeName] }
    : { text: `Your turn to ${verb}`, args: [] };
}

if (typeof module !== "undefined") module.exports = { tableStatus };
