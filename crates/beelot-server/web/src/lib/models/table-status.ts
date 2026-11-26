// The one status line of the table header (US-106): the English text to translate and the player names to put in it.
export interface StatusInput {
  phase: "bidding" | "play";
  complete?: boolean;
  roundOver?: boolean;
  dealing?: boolean;
  reviewingTrick?: boolean;
  trickWinner?: string;
  myTurn: boolean;
  activeName: string;
  passAndPlay: boolean;
}

export function tableStatus({ phase, complete, roundOver, dealing, reviewingTrick, trickWinner, myTurn, activeName, passAndPlay }: StatusInput): { text: string; args: string[] } {
  if (phase === "bidding" && complete) return { text: "The auction is over", args: [] };
  if (phase === "play") {
    if (roundOver) return { text: "Round over", args: [] };
    if (dealing) return { text: "Dealing the remaining cards…", args: [] };
    if (reviewingTrick) return { text: "{0} takes the trick", args: [trickWinner ?? ""] };
  }
  const verb = phase === "bidding" ? "bid" : "play";
  if (!myTurn) return { text: "{0} is thinking…", args: [activeName] };
  // On a shared device "You" is ambiguous: name the player who holds it.
  return passAndPlay ? { text: `{0}, your turn to ${verb}`, args: [activeName] } : { text: `Your turn to ${verb}`, args: [] };
}

// One line under the bid buttons telling what "Pass" leads to, so the button itself stays short (US-107).
export function passHelp({ variant, round }: { variant: string; round: number }): string {
  if (variant === "CONTREE") return "Pass: you make no bid. If all four players pass, the cards are dealt again.";
  if (variant === "BELA") return "Dalje: you pass the choice of trumps to the next player. The dealer may not pass.";
  if (variant !== "CLASSIC") return "Pass: you make no bid. If all four players pass, the cards are dealt again.";
  return round === 2 ? "Pass: if all four players pass, the cards are dealt again." : "Pass: the next player may take the card.";
}
