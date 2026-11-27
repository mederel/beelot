// The shapes the server answers with (crates/beelot-server/src/api/snapshot.rs; examples in tests/contract/*.json).
import type { Coded } from "$lib/i18n/types";

export type Suit = "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
export type Contract = Suit | "NO_TRUMPS" | "ALL_TRUMPS";
export type Variant = "CLASSIC" | "CONTREE" | "BELA" | "BULGARIAN" | "KLABERJASS" | "KLAVERJAS";
export type Difficulty = "RELAXED" | "CHALLENGING";
export type TeamName = "North–South" | "East–West";

export interface Card {
  rank: string;
  suit: Suit;
  symbol?: string;
}

export interface Call {
  playerName: string;
  call: string | null;
  callCode: Coded | null;
  active?: boolean;
}

export interface Bidding {
  hand: Card[];
  dealt?: Card[];
  upturnedCard: Card | null;
  round: number;
  activePlayer: string;
  playerTurn: boolean;
  message: string;
  messageCode: Coded | null;
  variant: Variant;
  highestBid: number;
  highestBidSuit: string;
  highestBidder: string;
  coincheAllowed: boolean;
  complete: boolean;
  dealerIndex: number;
  calls: Call[];
  currentPlayerIndex: number;
  auctionId: string;
  auction: Call[];
}

export interface BoardSeat {
  name: string;
  team: TeamName;
  cardCount: number;
  active: boolean;
}

export interface IllegalCard {
  card: Card;
  reason: string;
  suit?: string | null;
}

export interface Announcement {
  kind: "TIERCE" | "CINQUANTE" | "CENT" | "CARRE";
  cards: Card[];
  suit?: string;
  topCard: Card;
  value: number;
}

export interface Declaration {
  player: string;
  seat: number;
  team: TeamName;
  scored: boolean;
  announcements: Announcement[];
}

export interface ReviewTrick {
  cards: { card: Card; seat: number }[];
  winner: number;
}

export interface RoundResult {
  contractMade: boolean;
  capotTeam: TeamName | null;
  northSouthCardPoints: number;
  eastWestCardPoints: number;
  northSouthDixDeDer: number;
  eastWestDixDeDer: number;
  northSouthBeloteBonus: number;
  eastWestBeloteBonus: number;
  northSouthAnnouncements: number;
  eastWestAnnouncements: number;
  northSouthBid: number;
  eastWestBid: number;
  northSouthAwarded: number;
  eastWestAwarded: number;
  announcements: Declaration[];
  review: ReviewTrick[];
}

export interface Board {
  /** The four hands in seat order, at a tutorial table only (US-199). */
  allHands?: Card[][];
  hand: Card[];
  dealt?: Card[];
  legalCards: Card[];
  illegalCards: IllegalCard[];
  seats: BoardSeat[];
  trump: string;
  declaringTeam: TeamName | string;
  activePlayer: string;
  completedTricks: number;
  northSouthScore: number;
  eastWestScore: number;
  currentTrick: Card[];
  reviewingCompletedTrick: boolean;
  trickWinner: string;
  trickPoints: number;
  /** The roem of the trick under review, in Klaverjas (US-213); 0 otherwise. */
  trickRoem?: number;
  declarationMessage: string;
  declarationCode?: Coded | null;
  beloteBonusPoints: number;
  roundResult: RoundResult | null;
  variant: Variant;
  contractValue: number;
  coinched: boolean;
  currentPlayer: string;
  currentPlayerIndex: number;
  activePlayerIndex: number;
  dealerIndex: number;
  declaringPlayerIndex: number;
  announcements: boolean;
  ownAnnouncements: Announcement[];
  declarers: string[];
  revealedAnnouncements: Declaration[];
}

export interface MatchRecap {
  rounds: number;
  biggestRound: { round: number; team: TeamName; points: number } | null;
  announcements: Record<"northSouth" | "eastWest", Record<string, number>>;
}

export interface Match {
  northSouth: number;
  eastWest: number;
  complete: boolean;
  winner: TeamName | null;
  target: number;
  recap?: MatchRecap;
  rematchVoted?: number[];
  rematchPending?: number[];
}

export interface TableSeat {
  position: number;
  name: string;
  type: "HUMAN" | "BOT";
  ready: boolean;
  you: boolean;
  connectionState: "CONNECTED" | "DISCONNECTED" | "BOT_TAKEOVER" | string;
}

export interface TableInfo {
  id: string;
  invitationCode: string | null;
  ownerPosition: number;
  status: "WAITING_FOR_PLAYERS" | "IN_PROGRESS" | string;
  variant: Variant;
  variantLabel: string;
  turnTimerSeconds: number;
  seats: TableSeat[];
  publicTable: boolean;
  botFillAt: string | null;
  announcements: boolean;
  allTrumps: boolean;
  target: number;
  kind: "LOCAL" | "PRIVATE" | "PUBLIC" | string;
  difficulty: Difficulty | null;
  difficultyLabel: string | null;
  passAndPlay: boolean;
  hints: boolean;
  undoOffered?: boolean;
  undosLeft?: number;
  spectatorsAllowed: boolean;
  spectators: number;
}

export interface Reaction {
  sequence: number;
  position: number;
  reaction: string;
}

export interface Snapshot {
  version: number;
  moves: number;
  tableId: string;
  kind: string;
  you: number | null;
  table: TableInfo;
  bidding?: Bidding | null;
  board?: Board | null;
  match?: Match | null;
  reactions: Reaction[];
  tutorial?: TutorialInfo;
}

/** What a tutorial table tells its player (US-199): the lesson (none in the free game), and the coach on their turn. */
export interface TutorialInfo {
  lesson?: string;
  lessonDone: boolean;
  coach?: Coach;
}

export interface Coach {
  progress?: { step: number; steps: number; number: number; lessons: number };
  card: Card;
  why: string;
  others: { card: Card; whyNot: string }[];
}

export interface Access {
  tableId: string;
  playerToken: string;
  code?: string;
}

export type Action =
  | { type: "ready"; ready: boolean }
  | { type: "seat"; position: number }
  | { type: "start"; fillWithBots: boolean }
  | { type: "settings"; announcements?: boolean; allTrumps?: boolean; turnTimer?: number; target?: number }
  | { type: "spectators"; allowed: boolean }
  | { type: "pass" }
  | { type: "trump"; suit: string }
  | { type: "contract"; value: number; suit: string }
  | { type: "coinche" }
  | { type: "card"; rank: string; suit: string; declare?: boolean }
  | { type: "continueTrick" }
  | { type: "undo" }
  | { type: "nextRound" }
  | { type: "rematch" }
  | { type: "react"; reaction: string }
  | { type: "leave" };

export interface Hint {
  type: "bid" | "card";
  action?: { type: string; suit?: string; value?: number };
  card?: Card;
  reason: string;
}
