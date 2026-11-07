// The model of the auction sheet (US-120): what the sheet shows and which choices are open, from a `bidding` snapshot.
// It touches no DOM and translates nothing: texts are English keys, `reasonValue` is the value for their {0}.
const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160];
const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

const REASONS = {
  above: "Bid more than {0}",
  maxed: "No higher bid is possible: pass or coinche",
  suit: "That suit was passed on the first round",
  waiting: "Waiting for {0}…"
};

function auctionSheet(bidding, options = {}) {
  const contree = bidding.variant === "CONTREE";
  const mode = contree ? "bid" : bidding.round === 2 ? "suit" : "take";
  const enabled = Boolean(bidding.playerTurn) && !bidding.complete;
  const waiting = enabled ? null : REASONS.waiting;
  const waitingFor = enabled ? undefined : bidding.activePlayer;
  const upturnedSuit = bidding.upturnedCard?.suit ?? null;

  const suitNames = contree && options.allTrumps ? [...SUITS, "NO_TRUMPS", "ALL_TRUMPS"] : SUITS;
  const suits = suitNames.map((suit) => {
    const refused = mode === "suit" && suit === upturnedSuit;
    return {
      suit,
      disabled: !enabled || refused,
      reason: !enabled ? null : refused ? REASONS.suit : null
    };
  });

  const values = contree ? BID_VALUES.map((value) => {
    const low = value <= bidding.highestBid;
    return {
      value,
      disabled: !enabled || low,
      reason: enabled && low ? REASONS.above : null,
      reasonValue: enabled && low ? bidding.highestBid : undefined
    };
  }) : null;

  let bid = null;
  if (contree) {
    const lowest = values.find((item) => !item.disabled);
    const legal = suits.filter((item) => !item.disabled).map((item) => item.suit);
    const suit = legal.includes(options.suit) ? options.suit : legal[0] ?? SUITS[0];
    const maxed = enabled && !lowest;
    bid = {
      value: lowest ? lowest.value : BID_VALUES.at(-1),
      suit,
      disabled: !enabled || maxed,
      reason: !enabled ? waiting : maxed ? REASONS.maxed : null
    };
  }

  return {
    mode,
    title: mode === "take" ? "Take {0}?" : mode === "suit" ? "Choose a trump suit" : "Your call",
    titleSuit: mode === "take" ? upturnedSuit : null,
    history: bidding.auction ?? [],
    enabled,
    take: mode === "take" ? { suit: upturnedSuit, disabled: !enabled } : null,
    suits: mode === "take" ? [] : suits,
    values,
    pass: { disabled: !enabled, reason: waiting, reasonValue: waitingFor },
    coinche: { shown: Boolean(bidding.coincheAllowed), disabled: !enabled },
    bid
  };
}

if (typeof module !== "undefined") module.exports = { auctionSheet, BID_VALUES, SUITS, REASONS };
