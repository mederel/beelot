// The model of the auction sheet (US-120): what the sheet shows and which choices are open, from a `bidding` snapshot.
// It touches no DOM and translates nothing: texts are English keys, `reasonValue` is the value for their {0}.
import type { Bidding, Call } from "$lib/api/types";

export const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160];
// Bazar Blot (US-216): a number of tens from 8 to 24, and 25 for kaput, the bid of every trick.
export const KAPUT_BID = 25;
export const BAZAR_VALUES = [...Array.from({ length: 17 }, (_, index) => index + 8), KAPUT_BID];
export const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

// A Bulgarian game outranks the last one: clubs < diamonds < hearts < spades < no trumps < all trumps (US-215).
export const GAME_RANKS: Record<string, number> = { CLUBS: 1, DIAMONDS: 2, HEARTS: 3, SPADES: 4, NO_TRUMPS: 5, ALL_TRUMPS: 6 };

export const REASONS = {
  higher: "Bid a higher game than the last one",
  maxedGame: "No higher game is possible: pass",
  above: "Bid more than {0}",
  maxed: "No higher bid is possible: pass or coinche",
  maxedContra: "No higher bid is possible: pass or say contra",
  contra: "After a contra nobody may bid: pass or say recontra",
  suit: "That suit was passed on the first round",
  waiting: "Waiting for {0}…",
  dealer: "The dealer may not say dalje: name the trump suit",
  dealerPlays: "The dealer must play: choose trumps"
};

export type AuctionMode = "bid" | "suit" | "take";

export interface SuitChoice {
  suit: string;
  disabled: boolean;
  reason: string | null;
}

export interface ValueChoice {
  value: number;
  // "Kaput" for Bazar Blot's bid of every trick; otherwise the number is shown.
  label?: string;
  disabled: boolean;
  reason: string | null;
  reasonValue?: number;
}

export interface AuctionSheetModel {
  mode: AuctionMode;
  // Bulgarian belot: the bid is the game alone, its value is its rank.
  ranked: boolean;
  title: string;
  titleSuit: string | null;
  history: Call[];
  enabled: boolean;
  take: { suit: string | null; disabled: boolean } | null;
  suits: SuitChoice[];
  values: ValueChoice[] | null;
  pass: { disabled: boolean; reason: string | null; reasonValue?: string };
  // `label` is "Coinche", or "Contra" in Bazar Blot, where the bidding team may answer with recontra.
  coinche: { shown: boolean; disabled: boolean; label: string };
  recontra: { shown: boolean; disabled: boolean };
  // Bazar Blot after a contra (US-216): nobody may bid, so the panel shows only pass and recontra.
  closed: boolean;
  bid: { value: number; suit: string; disabled: boolean; reason: string | null } | null;
}

type AuctionInput = Pick<Bidding, "variant" | "round" | "playerTurn" | "complete" | "activePlayer" | "highestBid" | "coincheAllowed"> &
  Partial<Pick<Bidding, "auction" | "upturnedCard" | "dealerIndex" | "currentPlayerIndex" | "recontraAllowed" | "contra">>;

export function auctionSheet(bidding: AuctionInput, options: { allTrumps?: boolean; suit?: string | null } = {}): AuctionSheetModel {
  const ranked = bidding.variant === "BULGARIAN";
  // Bazar Blot (US-216) bids tens of points, from 8 to 24 or kaput, in a suit or no trumps; after a contra nobody bids.
  const bazar = bidding.variant === "BAZAR_BLOT";
  const contree = bidding.variant === "CONTREE" || bazar;
  const closed = bazar && Boolean(bidding.contra);
  // Bela (US-218) names the trump among six cards, in one round: the choice of a suit, as in Classic's second round.
  const bela = bidding.variant === "BELA";
  // Klaverjas (US-213) is the same auction among eight cards: play, naming the trump suit, or pass.
  const klaverjas = bidding.variant === "KLAVERJAS";
  const namesTrump = bela || klaverjas;
  const mode: AuctionMode = contree || ranked ? "bid" : namesTrump || bidding.round === 2 ? "suit" : "take";
  const enabled = Boolean(bidding.playerTurn) && !bidding.complete;
  const waiting = enabled ? null : REASONS.waiting;
  const waitingFor = enabled ? undefined : bidding.activePlayer;
  // The dealer cannot say "dalje" in Bela, nor pass in Klaverjas: the others have passed, so a suit must be named.
  const dealerMustName = namesTrump && enabled && bidding.currentPlayerIndex !== undefined && bidding.currentPlayerIndex === bidding.dealerIndex;
  const upturnedSuit = bidding.upturnedCard?.suit ?? null;

  const suitNames = bazar ? [...SUITS, "NO_TRUMPS"] : ranked || (contree && options.allTrumps) ? [...SUITS, "NO_TRUMPS", "ALL_TRUMPS"] : SUITS;
  const suits = suitNames.map((suit) => {
    const refused = mode === "suit" && suit === upturnedSuit;
    const low = ranked && GAME_RANKS[suit] <= bidding.highestBid;
    return { suit, disabled: !enabled || refused || low || closed, reason: !enabled ? null : refused ? REASONS.suit : low ? REASONS.higher : null };
  });

  const values: ValueChoice[] | null = contree
    ? (bazar ? BAZAR_VALUES : BID_VALUES).map((value) => {
        const low = value <= bidding.highestBid;
        return {
          value,
          ...(bazar && value === KAPUT_BID ? { label: "Kaput" } : {}),
          disabled: !enabled || low || closed,
          reason: enabled && closed ? REASONS.contra : enabled && low ? REASONS.above : null,
          reasonValue: enabled && low && !closed ? bidding.highestBid : undefined
        };
      })
    : null;

  let bid: AuctionSheetModel["bid"] = null;
  if (ranked) {
    const legal = suits.filter((item) => !item.disabled).map((item) => item.suit);
    const suit = options.suit && legal.includes(options.suit) ? options.suit : (legal[0] ?? SUITS[0]);
    const maxed = enabled && legal.length === 0;
    bid = { value: GAME_RANKS[suit], suit, disabled: !enabled || maxed, reason: !enabled ? waiting : maxed ? REASONS.maxedGame : null };
  } else if (contree && values) {
    const lowest = values.find((item) => !item.disabled);
    const legal = suits.filter((item) => !item.disabled).map((item) => item.suit);
    const suit = options.suit && legal.includes(options.suit) ? options.suit : (legal[0] ?? SUITS[0]);
    const maxed = enabled && !lowest;
    const maxedReason = closed ? REASONS.contra : bazar ? REASONS.maxedContra : REASONS.maxed;
    bid = {
      value: lowest ? lowest.value : values[values.length - 1].value,
      suit,
      disabled: !enabled || maxed,
      reason: !enabled ? waiting : maxed ? maxedReason : null
    };
  }

  return {
    mode,
    ranked,
    title: mode === "take" ? "Take {0}?" : bela ? "Name the trump suit or say dalje" : klaverjas ? "Choose trumps or pass" : mode === "suit" ? "Choose a trump suit" : "Your call",
    titleSuit: mode === "take" ? upturnedSuit : null,
    history: bidding.auction ?? [],
    enabled,
    take: mode === "take" ? { suit: upturnedSuit, disabled: !enabled } : null,
    suits: mode === "take" ? [] : suits,
    values,
    pass: { disabled: !enabled || dealerMustName, reason: dealerMustName ? (klaverjas ? REASONS.dealerPlays : REASONS.dealer) : waiting, reasonValue: waitingFor },
    coinche: { shown: Boolean(bidding.coincheAllowed), disabled: !enabled, label: bazar ? "Contra" : "Coinche" },
    recontra: { shown: Boolean(bidding.recontraAllowed), disabled: !enabled },
    closed,
    bid
  };
}

// The calls made after the player's own, in the order they were made: that is the order to show them in, clockwise from
// the player's left. The seats that spoke before the player were shown already and are never replayed.
export function callsAfterOwn(auction: Call[] | null | undefined, humanName: string): Call[] {
  const list = Array.isArray(auction) ? auction : [];
  const own = list.map((entry) => entry.playerName).lastIndexOf(humanName);
  return own < 0 ? [] : list.slice(own + 1);
}
