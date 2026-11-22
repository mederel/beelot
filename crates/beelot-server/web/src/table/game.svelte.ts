// One table on screen: solo, pass-and-play and online tables share it (US-119, US-121). It reads snapshots (from the
// API's answers or the online stream) and turns them into what the player sees, in order and at the pace of Settings
// (US-147): the deal, the calls one by one, each card flying to the trick, the trick gathered to its winner, the round's
// result and the match's end. The components only draw this state and call its actions.
//
// Every presentation runs under a generation number: a newer snapshot, or leaving the table, bumps it, and a sequence that
// finds its number outdated after a pause stops there.
import { api, ApiError, currentSnapshot, forgetTableSession, setPrivateSession, tableToken } from "$lib/api/client";
import type { Bidding, Board, Card, Hint, IllegalCard, Match, Snapshot, TableInfo, TeamName } from "$lib/api/types";
import type { Coded } from "$lib/i18n/types";
import { sfx, type SoundName } from "$lib/audio/sfx";
import { buzz } from "$lib/fx/haptics";
import { flyPacket, pause, boxOf, type Box } from "$lib/fx/flight";
import { burst } from "$lib/fx/particles";
import { cardName, formatNumber, localized, playerName, suitName, t } from "$lib/i18n/i18n.svelte";
import { countMatch, dismissOffer, loadOffer, saveOffer, shouldOffer } from "$lib/models/account-offer";
import { auctionSheet, callsAfterOwn, type AuctionSheetModel } from "$lib/models/auction-sheet";
import { createBotExpressionState } from "$lib/models/bot-expression-state";
import { commentFor, greetingFor } from "$lib/models/bot-lines";
import { botEvents, expressionsFor, isThinking } from "$lib/models/bot-reactions";
import { botCharacter, isBotName } from "$lib/models/bots";
import { arrivalOrder, cardKey, orderHandForDisplay, reasonText } from "$lib/models/card-physics";
import { callKind, contractAfterCall, contractFromAuction, contractFromBoard, type ContractView } from "$lib/models/contract-badge";
import { auctionView, gameEvents, playView, type GameEvent, type GameView } from "$lib/models/game-events";
import { forgetOnlineResume, forgetResume, onlineResumeCard, rememberOnlineResume, rememberResume } from "$lib/models/home-status";
import { lobbyModel, type LobbyModel } from "$lib/models/lobby-model";
import { createBeloteWatcher, matchEndModel, MOMENTS, momentsForRound, rematchView, type MatchEndModel, type MomentChip, type MomentKind } from "$lib/models/moments";
import { leaveConfirmation } from "$lib/models/small";
import { scoreBarAnnouncement, scoreBarModel, type ScoreBarModel } from "$lib/models/score-bar";
import { tableChips, type Chip } from "$lib/models/table-chips";
import { passHelp, tableStatus, type StatusInput } from "$lib/models/table-status";
import { makeToaster, type ToastKind } from "$lib/models/toast";
import { account } from "$lib/stores/account.svelte";
import { goalOutcome } from "$lib/stores/goals.svelte";
import { live } from "$lib/stores/live.svelte";
import { notices } from "$lib/stores/notices.svelte";
import { navigate, route, setLeaveGuard } from "$lib/stores/router.svelte";
import { motionFull, paced, settings } from "$lib/stores/settings.svelte";
import { closeTableStream, openTableStream } from "./stream";

export type Placement = "bottom" | "left" | "top" | "right";
export const PLACEMENTS: Placement[] = ["bottom", "left", "top", "right"];
const TEAMS: TeamName[] = ["North–South", "East–West"];
const FIRST_DEAL_STEPS: Record<string, number[]> = { CLASSIC: [3, 2], CONTREE: [3, 2, 3] };
const UNDO_SHOWN_MS = 7000;

// Hints (US-065): the card or bid the Challenging bot would choose for the player in turn, and why.
export const HINT_REASONS: Record<string, string> = {
  LEAD_TRUMPS: "Lead trumps",
  CASH_MASTER: "Cash a master card",
  LEAD_LOW: "Lead a low card",
  GIVE_POINTS: "Give points to your partner",
  KEEP_PARTNERS_TRICK: "Keep your partner's trick",
  WIN_CHEAPLY: "Win the trick cheaply",
  THROW_CHEAPEST: "Throw your cheapest card",
  BEST_FOR_ROUND: "The best card for the rest of the round",
  SUPPORT_PARTNER: "Support your partner's bid",
  BID_HAND_VALUE: "Bid what your hand is worth",
  COINCHE: "Coinche: you expect to defeat them",
  PASS_WEAK: "Pass: your hand is too weak"
};

// Preset reactions at online tables (US-020): nothing is typed, each player sees them in their own language.
export const REACTIONS: Record<string, [string, string]> = {
  WELL_PLAYED: ["👏", "Well played!"],
  NICE_HAND: ["😎", "Nice hand!"],
  OOPS: ["😅", "Oops!"],
  WOW: ["😮", "Wow!"],
  THINKING: ["🤔", "Let me think…"],
  GOOD_GAME: ["🤝", "Good game!"]
};

export interface SeatView {
  index: number;
  name: string;
  team: TeamName;
  cardCount: number;
  active: boolean;
  dealer: boolean;
  call: Coded | null;
  callFresh: number;
  stale: boolean;
  thinking: boolean;
}

export interface HandCard {
  card: Card;
  key: string;
  dealt: boolean;
}

export interface TrickCard {
  key: string;
  card: Card;
  seat: number;
  fly: boolean;
}

export interface RoundView {
  title: string;
  made: boolean;
  breakdown: string;
  next: boolean;
  results: boolean;
  review: boolean;
  northSouth: number;
  eastWest: number;
}

type LeaveKind = "online" | "solo" | null;

// The words of a game event for the live region (US-074).
function describe(event: GameEvent): string {
  if (event.type === "call") return t("{0}: {1}", playerName(event.player), localized(event.call));
  if (event.type === "card") return t("{0} played {1}.", playerName(event.player), cardName(event.card));
  if (event.type === "trick") return t("{0} wins the trick.", playerName(event.winner));
  if (event.type === "round") return `${t(event.made ? "Contract made" : "Contract failed")}.`;
  return t("{0} win the match!", t(event.winner));
}

const CARRE_RANKS: Record<string, string> = { J: "jacks", 9: "nines", A: "aces", 10: "tens", K: "kings", Q: "queens" };
const SEQUENCE_NAMES: Record<string, string> = { TIERCE: "Tierce to the {0}", CINQUANTE: "Cinquante to the {0}", CENT: "Cent to the {0}" };

export function announcementName(announcement: { kind: string; cards: Card[]; topCard: Card }): string {
  return announcement.kind === "CARRE" ? t("Carré of {0}", t(CARRE_RANKS[announcement.cards[0].rank])) : t(SEQUENCE_NAMES[announcement.kind], cardName(announcement.topCard));
}

function announcementsLine(round: any, board: Board): string {
  const points = round.northSouthAnnouncements || round.eastWestAnnouncements;
  if (!points) return t("Announcements: none.");
  const team = round.northSouthAnnouncements ? "North–South" : "East–West";
  const kinds = (board.revealedAnnouncements || [])
    .filter((declaration) => declaration.scored)
    .flatMap((declaration) => declaration.announcements)
    .map((announcement) => t(announcement.kind === "CARRE" ? "carré" : announcement.kind.toLowerCase()));
  // A failed contract hands every announcement that scored to the defence.
  const defence = board.declaringTeam === "North–South" ? "East–West" : "North–South";
  return round.contractMade || team === defence
    ? t("Announcements: {0} {1} ({2}).", t(team), points, kinds.join(" + "))
    : t("Announcements: {0} {1} ({2}), which go to {3}.", t(team), points, kinds.join(" + "), t(defence));
}

// Contrée (US-130): the bid is counted once, for the team that wins the contract, and shown as its own line.
function bidLine(round: any): string {
  const team = round.northSouthBid > 0 ? "North–South" : round.eastWestBid > 0 ? "East–West" : null;
  return team ? ` ${t("Bid: {0} points go to {1}.", round.northSouthBid || round.eastWestBid, t(team))}` : "";
}

export function roundScoreText(round: any, board: Board): string {
  const capot = !round.capotTeam ? "" : `${t("Capot! {0} take every trick and score 250.", t(round.capotTeam))} `;
  const detail =
    capot +
    t(
      "North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.",
      round.northSouthCardPoints,
      round.northSouthDixDeDer,
      round.northSouthBeloteBonus,
      round.northSouthAwarded,
      round.eastWestCardPoints,
      round.eastWestDixDeDer,
      round.eastWestBeloteBonus,
      round.eastWestAwarded
    );
  const announcements = board.announcements ? ` ${announcementsLine(round, board)}` : "";
  return (board.coinched ? t("Coinche doubles the awarded scores. {0}", detail) : detail) + announcements + bidLine(round);
}

// The games whose greeting this tab has already handled, so a reload at the very start does not greet twice.
function markGreeted(game: string): boolean {
  try {
    const greeted = JSON.parse(sessionStorage.getItem("beelot.greeted") ?? "[]");
    if (greeted.includes(game)) return false;
    sessionStorage.setItem("beelot.greeted", JSON.stringify([...greeted.slice(-19), game]));
  } catch {
    return true;
  }
  return true;
}

// The deal last animated, per page: a new deal (a new dealer) is dealt again, a reload of the same one is not.
let lastDealKey = "";
// Classic Belote's second deal follows the auction: the hand held during the auction, to deal the rest onto.
let pendingSecondDeal: { gameId: string; hand: Card[]; viewer: string } | null = null;

export class TableGame {
  readonly id: string;
  phase = $state<"auction" | "online" | null>(null);
  stage = $state<"loading" | "lobby" | "auction" | "play">("loading");
  snapshot = $state<Snapshot | null>(null);
  info = $state<TableInfo | null>(null);
  viewer = $state(0);
  seats = $state<SeatView[]>([]);
  expressions = $state<Record<number, string>>({});
  contract = $state<ContractView | null>(null);
  contractBounce = $state(0);
  hand = $state<HandCard[]>([]);
  legal = $state<string[]>([]);
  illegal = $state<Record<string, IllegalCard>>({});
  handLive = $state(false);
  playing = $state<string | null>(null);
  trump = $state("");
  trick = $state<TrickCard[]>([]);
  trickWinner = $state<number | null>(null);
  trickPoints = $state(0);
  collecting = $state<{ cards: TrickCard[]; to: number; key: number } | null>(null);
  completedTricks = $state(0);
  status = $state("");
  statusFlash = $state(false);
  score = $state<ScoreBarModel | null>(null);
  toast = $state<{ text: string; kind: ToastKind; key: number } | null>(null);
  declare = $state<{ label: string } | null>(null);
  declareOn = $state(true);
  chips = $state<Chip[]>([]);
  round = $state<RoundView | null>(null);
  matchEnd = $state<MatchEndModel | null>(null);
  matchEndAnimate = $state(false);
  review = $state<{ open: boolean; analysis: any; explanations: any } | null>(null);
  hintAvailable = $state(false);
  hintCard = $state<string | null>(null);
  hintBid = $state<{ type: string; suit?: string; value?: number } | null>(null);
  hintReason = $state("");
  undo = $state<{ left: number } | null>(null);
  auction = $state<{ model: AuctionSheetModel; bidding: Bidding; reason: string; open: boolean; busy: boolean; allTrumps: boolean; upturned: Card | null; hand: Card[] } | null>(null);
  lobby = $state<{ model: LobbyModel; table: TableInfo; countdown: string; message: string } | null>(null);
  watchers = $state("");
  reactions = $state({ allowed: false, tray: false });
  bubbles = $state<{ seat: number; text: string; key: number }[]>([]);
  botLine = $state<{ seat: number; text: string; key: number } | null>(null);
  celebration = $state<{ kind: MomentKind; chips: MomentChip[]; key: number } | null>(null);
  handoff = $state<{ name: string } | null>(null);
  leave = $state<{ open: boolean; title: string; message: string; destination: string }>({ open: false, title: "", message: "", destination: "" });
  title = $state("");
  menuGame = $state("");
  dealing = $state(false);
  shake = $state(0);

  // Elements the flights start from and land on, registered by the components.
  anchors = { seats: new Map<number, HTMLElement>(), hand: null as HTMLElement | null, centre: null as HTMLElement | null, layer: null as HTMLElement | null };
  handOrigins = new Map<string, { box: Box; at: number }>();

  private gen = 0;
  private alive = true;
  private announced: GameView | null = null;
  private scoreSentence = "";
  private turnText = "";
  private flashTimer = 0;
  private toastKey = 0;
  private toastedDeclaration = "";
  private toastedDeclarers = "";
  private trickSeen = false;
  private trickReviewed = false;
  private collectKey = 0;
  private pendingCollection = "";
  private undoKey = "";
  private undoTimer = 0;
  private handoffShown = "";
  private handoffResolve: (() => void) | null = null;
  private leaveKind: LeaveKind = null;
  private matchComplete = false;
  private reactionsSeen = { sequence: 0, loaded: false };
  private bubbleKey = 0;
  private botComment = { shown: false, trickShown: false, count: 0, timer: 0 };
  private beloteWatcher = createBeloteWatcher();
  private matchEndDismissed = false;
  private matchEndShown = false;
  private matchEndLast: MatchEndModel | null = null;
  private offer = loadOffer(globalThis.localStorage as Storage);
  private requestId = 0;
  private renderedVersion = -1;
  private countdownTimer = 0;
  private retryTimer = 0;
  private bots = createBotExpressionState({
    isBot: isBotName,
    setExpression: (_prefix: string, seat: number, expression: string) => {
      this.expressions = { ...this.expressions, [seat]: expression };
    },
    botEvents,
    expressionsFor,
    isThinking,
    onEvents: (_prefix: string, events: any[], seats: any[]) => this.comment(events, seats)
  });
  private toaster = makeToaster({
    show: (text, kind) => (this.toast = { text, kind, key: ++this.toastKey }),
    hide: () => (this.toast = null),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (id) => window.clearTimeout(id)
  });
  private onResync = () => this.resync();
  private onVisible = () => {
    if (document.visibilityState === "visible") this.resync();
  };

  constructor(id: string, phase: "auction" | "online" | null) {
    this.id = id;
    this.phase = phase;
    this.bots.reset(id);
    setLeaveGuard((destination) => this.askToLeave(destination));
    window.addEventListener("online", this.onResync);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  get online(): boolean {
    return this.phase === "online";
  }

  get exitPath(): string {
    return this.online ? (location.pathname.startsWith("/online/public") ? "/online/public" : "/online/private") : "/play/bot";
  }

  destroy(): void {
    this.alive = false;
    this.gen += 1;
    setLeaveGuard(null);
    window.removeEventListener("online", this.onResync);
    document.removeEventListener("visibilitychange", this.onVisible);
    window.clearTimeout(this.undoTimer);
    window.clearTimeout(this.flashTimer);
    window.clearTimeout(this.botComment.timer);
    window.clearInterval(this.countdownTimer);
    window.clearTimeout(this.retryTimer);
    this.toaster.clear();
    closeTableStream();
    live.score = "";
  }

  // ------------------------------------------------------------------ loading
  setPhase(phase: "auction" | "online" | null): void {
    if (this.phase === phase && this.stage !== "loading") return;
    this.phase = phase;
    this.load();
  }

  load(): void {
    if (this.online) this.loadOnline();
    else this.loadSolo();
  }

  private shown(): boolean {
    const current = route();
    return this.alive && current.view === "table" && current.params.id === this.id;
  }

  // After a failed load the screen stays where it is and loads again in a few seconds (US-141).
  private retry(error: unknown, again: () => void): boolean {
    if (!(error as ApiError)?.network) return false;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.shown() && again(), 3000);
    return true;
  }

  async loadSolo(): Promise<void> {
    try {
      const snapshot = await api.table(this.id);
      if (!this.shown()) return;
      await this.present(snapshot);
    } catch (error) {
      if (this.retry(error, () => this.loadSolo())) return;
      navigate(this.exitPath, { replace: true });
    }
  }

  async loadOnline({ fresh = false } = {}): Promise<void> {
    const request = ++this.requestId;
    try {
      const snapshot = fresh ? await api.table(this.id) : await currentSnapshot(this.id);
      if (request !== this.requestId || !this.shown()) return;
      if (!fresh && snapshot.version < this.renderedVersion) return;
      this.renderedVersion = snapshot.version;
      openTableStream(this.id, {
        onSnapshot: () => this.shown() && this.loadOnline(),
        onSpoken: (events) => {
          if (events.length) live.game = events.map(describe).join(" ");
        },
        onRefused: (message) => this.lobbyMessage(message),
        resync: () => this.loadOnline({ fresh: true })
      });
      await this.present(snapshot);
    } catch (error) {
      if (request !== this.requestId) return;
      if (this.retry(error, () => this.loadOnline({ fresh: true }))) return;
      notices.set(this.exitPath, t("That table is no longer available."));
      navigate(this.exitPath, { replace: true });
    }
  }

  // The connection came back, or the app came back to the front on a phone: the table is read again at once (US-141).
  resync(): Promise<void> {
    if (!navigator.onLine || !this.shown()) return Promise.resolve();
    if (this.online) return this.loadOnline({ fresh: true }).catch(() => {});
    if (this.stage === "play") return this.loadSolo().catch(() => {});
    return Promise.resolve();
  }

  // ------------------------------------------------------------------ presenting
  private async present(snapshot: Snapshot): Promise<void> {
    this.snapshot = snapshot;
    this.info = snapshot.table;
    const table = snapshot.table;
    this.title = t(table.variantLabel);
    this.menuGame = this.online ? `${t(table.publicTable ? "Public table" : "Private table")} · ${t(table.variantLabel)}` : t("{0} · {1} bots", t(table.variantLabel), t(table.difficultyLabel ?? ""));
    if (this.online) {
      this.rememberOnline(snapshot);
      const waiting = table.status === "WAITING_FOR_PLAYERS";
      this.leaveKind = "online";
      this.matchComplete = Boolean(snapshot.match?.complete);
      const mine = table.seats.find((seat) => seat.you);
      this.watchers = !mine ? t("You are watching this table.") : table.spectators > 0 ? t(table.spectators === 1 ? "{0} spectator is watching." : "{0} spectators are watching.", table.spectators) : "";
      if (waiting) {
        this.presentLobby(snapshot);
      } else {
        this.stopCountdown();
        this.lobby = null;
        this.reactions.allowed = Boolean(mine) && settings.reactions;
        if (snapshot.board) await this.presentPlay(snapshot);
        else if (snapshot.bidding) await this.presentAuction(snapshot);
        if (settings.reactions) this.loadReactions(snapshot);
      }
      if (mine && mine.connectionState !== "CONNECTED") this.setStatus(t(mine.connectionState === "BOT_TAKEOVER" ? "Bot takeover" : "Disconnected"));
      return;
    }
    this.leaveKind = "solo";
    // The address and the table agree: the auction has its route, the cards theirs.
    if (snapshot.board && this.phase === "auction" && snapshot.bidding?.complete) {
      await this.presentAuction(snapshot);
      return;
    }
    if (snapshot.board) await this.presentPlay(snapshot);
    else if (snapshot.bidding) {
      if (this.phase !== "auction") {
        navigate(`/play/bot/bidding/${this.id}`, { replace: true });
        return;
      }
      await this.presentAuction(snapshot);
    }
  }

  private rememberSolo(snapshot: Snapshot): void {
    if (snapshot.table.kind !== "LOCAL" || snapshot.table.passAndPlay) return;
    if (snapshot.match?.complete) forgetResume(localStorage);
    else rememberResume(localStorage, snapshot.tableId, tableToken(snapshot.tableId));
  }

  private rememberOnline(snapshot: Snapshot): void {
    if (onlineResumeCard(snapshot)) rememberOnlineResume(localStorage, snapshot.tableId, tableToken(snapshot.tableId));
    else forgetOnlineResume(localStorage, snapshot.tableId);
  }

  private announce(view: GameView): void {
    const events = gameEvents(this.announced, view);
    this.announced = view;
    if (events.length) live.game = events.map(describe).join(" ");
  }

  private seatsFrom(names: { name: string }[], fields: (index: number) => Partial<SeatView>): SeatView[] {
    return names.map((seat, index) => {
      const previous = this.seats.find((item) => item.index === index && item.name === seat.name);
      return {
        index,
        name: seat.name,
        team: TEAMS[index % 2],
        cardCount: 0,
        active: false,
        dealer: false,
        call: null,
        callFresh: previous?.callFresh ?? 0,
        stale: false,
        thinking: false,
        ...fields(index)
      };
    });
  }

  placement(seat: number): Placement {
    return PLACEMENTS[(seat - this.viewer + 4) % 4];
  }

  private setContract(contract: ContractView | null, bounce: boolean): void {
    const key = (value: ContractView | null) => (value ? [value.player, value.value, value.suit, value.coinched].join("|") : "");
    if (bounce && key(contract) !== key(this.contract) && contract) this.contractBounce += 1;
    this.contract = contract;
  }

  private showScore(match: Match | null | undefined, board: Board | null | undefined, myTeam: number | null): void {
    const model = scoreBarModel({ match, board, myTeam });
    this.score = model;
    if (!model) return;
    const sentence = scoreBarAnnouncement(model, t, formatNumber);
    if (sentence !== this.scoreSentence) {
      this.scoreSentence = sentence;
      live.score = sentence;
    }
  }

  // ------------------------------------------------------------------ status line and toasts
  private setStatus(text: string): void {
    this.status = text;
    this.statusFlash = false;
  }

  private showStatus(state: StatusInput): void {
    const { text, args } = tableStatus(state);
    this.turnText = t(text, ...args.map(playerName));
    window.clearTimeout(this.flashTimer);
    this.setStatus(this.turnText);
  }

  // A short message in the status line (US-107): the turn text comes back after `ms`.
  flash(text: string, ms = 3000): void {
    this.status = text;
    this.statusFlash = true;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.setStatus(this.turnText), ms);
  }

  pushToast(text: string, kind: ToastKind): void {
    this.toaster.push(text, kind);
  }

  // ------------------------------------------------------------------ pass and play
  // A cover hides every card until the human whose hand is shown says they hold the device.
  private handOff(passAndPlay: boolean, viewerName: string): Promise<void> {
    const key = `${this.id}:${viewerName}`;
    if (!passAndPlay || this.handoffShown === key) return Promise.resolve();
    this.handoff = { name: viewerName };
    return new Promise((resolve) => {
      this.handoffResolve = () => {
        this.handoffShown = key;
        this.handoff = null;
        resolve();
      };
    });
  }

  handoffReady(): void {
    const resolve = this.handoffResolve;
    this.handoffResolve = null;
    resolve?.();
  }

  // ------------------------------------------------------------------ auction
  private async presentAuction(snapshot: Snapshot): Promise<void> {
    const gen = ++this.gen;
    const bidding = snapshot.bidding!;
    const table = snapshot.table;
    const online = this.online;
    this.stage = "auction";
    if (!online) {
      this.announce(auctionView(bidding));
      this.rememberSolo(snapshot);
    }
    this.matchComplete = false;
    this.showStatus({ phase: "bidding", complete: bidding.complete, myTurn: bidding.playerTurn, activeName: bidding.activePlayer, passAndPlay: table.passAndPlay });
    this.toaster.clear();
    this.chips = [];
    this.declare = null;
    this.round = null;
    this.trick = [];
    this.trickWinner = null;
    this.trickReviewed = false;
    // The table is empty during the auction: the first cards of the play arrive one by one.
    this.trickSeen = true;
    this.undo = null;
    this.handLive = false;
    this.trump = "";
    const viewer = bidding.currentPlayerIndex < 0 ? 0 : bidding.currentPlayerIndex;
    this.viewer = viewer;
    const humanName = table.seats[bidding.currentPlayerIndex]?.name ?? "";
    const handedOff = this.handOff(table.passAndPlay, humanName);
    const dealKey = `${this.id}:${bidding.dealerIndex}`;
    const animateDeal = !online && dealKey !== lastDealKey && motionFull() && !bidding.calls.some((call) => call.playerName === humanName && call.call);
    lastDealKey = dealKey;
    pendingSecondDeal = bidding.variant === "CONTREE" || online ? null : { gameId: this.id, hand: bidding.hand, viewer: humanName };
    // While the deal is animated the cards sit in the order the pile gave them; the hand is sorted when it ends (US-140).
    const order = animateDeal ? (bidding.dealt ?? bidding.hand) : orderHandForDisplay(bidding.hand);
    this.hand = order.map((card) => ({ card, key: cardKey(card), dealt: !animateDeal }));
    this.legal = [];
    this.illegal = {};
    this.dealing = animateDeal;
    const seatNames = table.seats.map((seat) => ({ name: seat.name }));
    this.seats = this.seatsFrom(seatNames, (index) => ({
      cardCount: animateDeal ? 0 : bidding.hand.length,
      active: seatNames[index].name === bidding.activePlayer,
      dealer: index === bidding.dealerIndex,
      call: animateDeal ? null : (bidding.calls.find((call) => call.playerName === seatNames[index].name)?.callCode ?? null)
    }));
    this.setContract(animateDeal ? null : contractFromAuction(bidding.auction), true);
    this.bots.updateBidding("tbl", this.seats, bidding, snapshot.match);
    this.renderAuctionSheet(bidding, table, false);
    if (animateDeal && this.auction) this.auction.open = false;
    this.offerHint(!online && table.hints && bidding.playerTurn && !bidding.complete);
    this.showScore(snapshot.match, null, table.passAndPlay ? null : viewer % 2);
    await handedOff;
    if (gen !== this.gen) return;
    this.showScore(snapshot.match, null, viewer % 2);
    if (animateDeal) {
      // The deal and the calls before the player's own play out on the table; the panel comes up after them.
      if (this.auction) {
        this.auction.busy = true;
        this.auction.open = false;
      }
      await this.openingDeal(bidding, table, gen);
      if (gen !== this.gen) return;
      this.dealing = false;
      if (this.auction) {
        this.auction.busy = false;
        this.auction.open = bidding.playerTurn && !bidding.complete;
      }
    }
    if (bidding.playerTurn && !bidding.complete) sfx.play("turn");
    // A bot took the contract before the player's first call: show its call, then the cards.
    if (bidding.complete && !online) {
      await pause(paced("ownCall"));
      if (gen !== this.gen || !this.shown()) return;
      navigate(`/play/bot/game/${this.id}`);
    }
  }

  private renderAuctionSheet(bidding: Bidding, table: TableInfo, keepSuit: boolean): void {
    const suit = keepSuit ? (this.auction?.model.bid?.suit ?? null) : null;
    const model = auctionSheet(bidding, { allTrumps: table.allTrumps, suit });
    this.auction = {
      model,
      bidding,
      reason: this.auctionReason(model, bidding),
      open: bidding.playerTurn && !bidding.complete,
      busy: false,
      allTrumps: table.allTrumps,
      upturned: model.mode === "take" ? bidding.upturnedCard : null,
      hand: orderHandForDisplay(bidding.hand)
    };
  }

  // The one line that says why something is disabled, or else what passing means.
  private auctionReason(model: AuctionSheetModel, bidding: Bidding): string {
    const say = (reason: string, value?: unknown) => t(reason, typeof value === "string" ? playerName(value) : value);
    if (!model.enabled && model.pass.reason) return say(model.pass.reason, model.pass.reasonValue);
    if (model.bid?.reason) return say(model.bid.reason);
    const refused = model.suits.find((item) => item.reason);
    if (refused) return say(refused.reason!);
    const low = (model.values ?? []).filter((item) => item.reason).at(-1);
    if (low) return say(low.reason!, low.reasonValue);
    return t(passHelp({ variant: bidding.variant, round: bidding.round }));
  }

  private seatIndexOf(name: string): number {
    return this.seats.findIndex((seat) => seat.name === name);
  }

  // Shows a call on its seat: earlier calls fade back so the newest is the focus, the contract badge follows.
  private showCall(seatIndex: number, call: Coded | null): boolean {
    if (seatIndex < 0 || !call) return false;
    const seat = this.seats[seatIndex];
    if (seat.call && localized(seat.call) === localized(call)) return false;
    const kind = callKind(call);
    this.seats = this.seats.map((item) =>
      item.index === seatIndex ? { ...item, call, callFresh: item.callFresh + 1, stale: false, thinking: false } : { ...item, stale: Boolean(item.call) }
    );
    if (kind !== "pass") this.setContract(contractAfterCall(this.contract, seat.name, call), true);
    if (kind === "coinche") {
      this.shake += 1;
      buzz("coinche");
    }
    sfx.play(kind === "pass" ? "pass" : kind === "coinche" ? "coinche" : "bid");
    return true;
  }

  // A bot's call: a beat of "thinking", then the call stays in the spotlight (the pauses of the pace setting).
  private async announceCall(name: string, call: Coded | null, gen: number): Promise<void> {
    const seatIndex = this.seatIndexOf(name);
    if (seatIndex < 0 || !call) return;
    const seat = this.seats[seatIndex];
    if (seat.call && localized(seat.call) === localized(call)) return;
    this.seats = this.seats.map((item) => (item.index === seatIndex ? { ...item, thinking: true } : item));
    await pause(paced("biddingThink"));
    if (gen !== this.gen) return;
    if (this.showCall(seatIndex, call)) await pause(paced("biddingReveal"));
  }

  private async openingDeal(bidding: Bidding, table: TableInfo, gen: number): Promise<void> {
    const steps = (FIRST_DEAL_STEPS[bidding.variant] ?? [3, 2]).map((size) => ({ sizes: table.seats.map(() => size), fromCentre: false }));
    await this.deal(steps, bidding.dealerIndex, 0, gen);
    if (gen !== this.gen) return;
    this.hand = orderHandForDisplay(bidding.hand).map((card) => ({ card, key: cardKey(card), dealt: true }));
    await pause(380);
    // Then the bids made by the players who speak before the human.
    const names = table.seats.map((seat) => seat.name);
    const human = names[bidding.currentPlayerIndex];
    const order = (name: string) => (names.indexOf(name) - bidding.dealerIndex - 1 + names.length) % names.length;
    const early = bidding.calls.filter((call) => call.callCode && call.playerName !== human).sort((left, right) => order(left.playerName) - order(right.playerName));
    for (const call of early) {
      if (gen !== this.gen) return;
      await this.announceCall(call.playerName, call.callCode, gen);
    }
  }

  // Deals packets of card backs: each step gives `sizes[seat]` cards to every seat from the dealer's left; a step may come
  // from the middle of the table (the upturned card). The player's cards turn face up as their packets land.
  private async deal(steps: { sizes: number[]; fromCentre: boolean }[], dealerIndex: number, startCount: number, gen: number): Promise<void> {
    const counts = this.seats.map(() => startCount);
    const layer = this.anchors.layer;
    const cardWidth = (this.anchors.hand?.querySelector(".hand-card") as HTMLElement | null)?.getBoundingClientRect().width ?? 60;
    for (const step of steps) {
      for (let offset = 1; offset <= this.seats.length; offset += 1) {
        if (gen !== this.gen) return;
        const seatIndex = (dealerIndex + offset) % this.seats.length;
        const size = step.sizes[seatIndex];
        if (!size) continue;
        const human = seatIndex === this.viewer;
        const from = step.fromCentre ? boxOf(this.anchors.centre) : boxOf(this.anchors.seats.get(dealerIndex));
        const to = human ? boxOf(this.anchors.hand) : boxOf(this.anchors.seats.get(seatIndex));
        sfx.play("deal");
        if (layer && from && to) await flyPacket(layer, from, to, size, paced("dealFlight"), cardWidth * 0.8);
        else await pause(paced("dealFlight"));
        if (gen !== this.gen) return;
        counts[seatIndex] += size;
        if (human) {
          let left = size;
          this.hand = this.hand.map((item) => {
            if (!item.dealt && left > 0) {
              left -= 1;
              return { ...item, dealt: true };
            }
            return item;
          });
          sfx.play("flip");
        }
        this.seats = this.seats.map((item) => (item.index === seatIndex ? { ...item, cardCount: counts[seatIndex] } : item));
        await pause(paced("dealGap"));
      }
    }
  }

  async bid(action: "pass" | "trump" | "contract" | "coinche", body: { suit?: string; value?: number } = {}): Promise<void> {
    this.clearHint();
    if (!this.auction || this.auction.busy) return;
    if (this.online) {
      // The sheet is hidden until the table is redrawn, so the other players' calls are what shows.
      this.auction.open = false;
      await this.onlineAction({ type: action, ...body } as any);
      return;
    }
    const gen = ++this.gen;
    this.auction.busy = true;
    this.auction.open = false;
    const human = this.seats[this.viewer]?.name ?? "";
    try {
      const own: Coded =
        action === "pass"
          ? { code: "call-pass", params: {} }
          : action === "coinche"
            ? { code: "call-coinche", params: {} }
            : action === "contract"
              ? { code: "call-bid", params: { value: String(body.value), trump: body.suit } }
              : { code: "call-trump", params: { trump: body.suit } };
      this.showCall(this.viewer, own);
      await pause(paced("ownCall"));
      const response = (await api.act(this.id, { type: action, ...body } as any)).bidding!;
      // Only the calls made after the player's own are new, in the order they were made.
      if (action !== "trump" && action !== "coinche") {
        for (const call of callsAfterOwn(response.auction, human)) {
          if (!call.callCode || call.playerName === human) continue;
          await this.announceCall(call.playerName, call.callCode, gen);
          if (gen !== this.gen) return;
        }
      }
      if (action === "trump" || action === "coinche" || response.complete) {
        navigate(`/play/bot/game/${this.id}`);
        return;
      }
      this.loadSolo();
    } catch (error) {
      // A refused call must not stay on the table: redraw the auction as the server holds it.
      if ((error as ApiError).status) await this.loadSolo();
      this.flash((error as Error).message);
      if (this.auction) {
        this.auction.busy = false;
        this.auction.open = true;
      }
    }
  }

  // ------------------------------------------------------------------ the card play
  private async presentPlay(snapshot: Snapshot): Promise<void> {
    const gen = ++this.gen;
    const board = snapshot.board!;
    const match = snapshot.match;
    const table = snapshot.table;
    const online = this.online;
    this.stage = "play";
    this.auction = null;
    this.dealing = false;
    this.trump = board.trump;
    if (!online) {
      this.announce(playView(board, match));
      this.rememberSolo(snapshot);
    }
    this.matchComplete = Boolean(match?.complete);
    this.viewer = board.currentPlayerIndex;
    const handedOff = this.handOff(table.passAndPlay, board.currentPlayer);
    const myTurn = board.activePlayerIndex === board.currentPlayerIndex && !board.reviewingCompletedTrick && !board.roundResult;
    this.offerHint(!online && table.hints && myTurn);
    this.offerUndo(!online && !table.passAndPlay && Boolean(table.undoOffered), table.undosLeft ?? 0, `${this.id}:${board.completedTricks}:${board.hand.length}:${board.currentTrick.length}`);
    this.showScore(match, board, table.passAndPlay ? null : board.currentPlayerIndex % 2);
    const declaration = (board.declarationCode ? localized(board.declarationCode, board.declarationMessage) : "") + (board.beloteBonusPoints ? t(" Belote/Rebelote bonus: {0} points.", board.beloteBonusPoints) : "");
    if (declaration.trim() && declaration !== this.toastedDeclaration) this.pushToast(declaration, "declaration");
    this.toastedDeclaration = declaration;
    const declarers = (board.declarers || []).map((name) => t("{0} declares.", playerName(name))).join(" ");
    if (declarers && declarers !== this.toastedDeclarers) this.pushToast(declarers, "declaration");
    this.toastedDeclarers = declarers;
    this.renderChips(board);
    this.completedTricks = board.completedTricks;
    const secondDeal = !online && pendingSecondDeal?.gameId === this.id && pendingSecondDeal.viewer === board.currentPlayer && motionFull() ? pendingSecondDeal : null;
    pendingSecondDeal = null;
    const seatsFor = (count?: number) =>
      this.seatsFrom(board.seats, (index) => ({
        cardCount: count ?? board.seats[index].cardCount,
        active: board.seats[index].active,
        dealer: index === board.dealerIndex
      }));
    this.seats = seatsFor(secondDeal ? secondDeal.hand.length : undefined);
    this.setContract(contractFromBoard(board), true);
    if (snapshot.bidding) this.bots.updateBidding("tbl", this.seats, snapshot.bidding, match);
    this.bots.updateBoard("tbl", board, match);
    this.fillHand(board, secondDeal);
    if (!board.roundResult) {
      this.round = null;
      if (!this.matchComplete) this.resetMatchEnd();
    }
    await handedOff;
    if (gen !== this.gen) return;
    this.showScore(match, board, board.currentPlayerIndex % 2);
    if (secondDeal) {
      this.showStatus({ phase: "play", dealing: true, myTurn: false, activeName: board.activePlayer, passAndPlay: table.passAndPlay });
      await this.secondDeal(board, secondDeal.hand, gen);
      if (gen !== this.gen) return;
      this.seats = seatsFor();
    }
    this.showStatus({
      phase: "play",
      roundOver: Boolean(board.roundResult),
      reviewingTrick: board.reviewingCompletedTrick,
      trickWinner: board.trickWinner,
      myTurn: board.activePlayerIndex === board.currentPlayerIndex,
      activeName: board.activePlayer,
      passAndPlay: table.passAndPlay
    });
    const revealed = await this.presentTrick(board, gen);
    if (gen !== this.gen) return;
    // The belote of the viewer's team is celebrated once the card that declared it has landed.
    const belote = this.beloteWatcher.watch({ declaration: board.declarationCode ?? null, seats: board.seats, myTeam: board.currentPlayerIndex % 2 });
    if (belote) this.celebrate(belote, []);
    this.handLive = myTurn;
    if (myTurn && revealed) sfx.play("turn");
    if (board.reviewingCompletedTrick && !board.roundResult) this.collectLater(board.completedTricks);
    if (board.roundResult) await this.presentRound(snapshot, revealed, gen);
  }

  private fillHand(board: Board, secondDeal: { hand: Card[] } | null): void {
    const ordered = orderHandForDisplay(board.hand, board.trump);
    if (secondDeal) {
      // The hand held before the deal stays sorted, and the new cards follow in the order the pile gives them (US-140).
      const held = orderHandForDisplay(secondDeal.hand, board.trump).map(cardKey);
      const takesUpturned = board.declaringPlayerIndex === board.currentPlayerIndex;
      const arrival = arrivalOrder(held, (board.dealt ?? board.hand).map(cardKey), takesUpturned);
      const byKey = new Map(board.hand.map((card) => [cardKey(card), card]));
      const known = new Set(held);
      this.hand = arrival.filter((key) => byKey.has(key)).map((key) => ({ card: byKey.get(key)!, key, dealt: known.has(key) }));
    } else {
      this.hand = ordered.map((card) => ({ card, key: cardKey(card), dealt: true }));
    }
    this.legal = board.legalCards.map(cardKey);
    const illegal: Record<string, IllegalCard> = {};
    for (const entry of board.illegalCards ?? []) illegal[cardKey(entry.card)] = entry;
    this.illegal = illegal;
    this.handLive = false;
    this.playing = null;
  }

  private async secondDeal(board: Board, previous: Card[], gen: number): Promise<void> {
    const taker = board.declaringPlayerIndex;
    await this.deal(
      [
        { sizes: board.seats.map((_, index) => (index === taker ? 2 : 3)), fromCentre: false },
        { sizes: board.seats.map((_, index) => (index === taker ? 1 : 0)), fromCentre: true }
      ],
      board.dealerIndex,
      previous.length,
      gen
    );
    if (gen !== this.gen) return;
    await pause(paced("dealGap"));
    this.hand = orderHandForDisplay(board.hand, board.trump).map((card) => ({ card, key: cardKey(card), dealt: true }));
    await pause(420);
  }

  // Cards already on the table stay still; only cards played since they were shown arrive, one by one. A new trick (the
  // previous one was reviewed) starts from an empty table while the old one is gathered to its winner. What is on the
  // table is the reference, so a presentation cut short by a newer snapshot leaves nothing half-shown.
  private async presentTrick(board: Board, gen: number): Promise<boolean> {
    const cards = board.currentTrick;
    const keys = cards.map(cardKey);
    const reviewing = board.reviewingCompletedTrick;
    const shown = this.trick.map((item) => item.key);
    const first = !this.trickSeen;
    this.trickSeen = true;
    const prefix = shown.length <= keys.length && shown.every((key, index) => keys[index] === key);
    const sameTrick = !first && prefix && !(this.trickReviewed && !reviewing);
    const alreadyShown = first ? cards.length : sameTrick ? shown.length : 0;
    const leader = (board.activePlayerIndex - cards.length + 4) % 4;
    const winnerIndex = reviewing ? board.seats.findIndex((seat) => seat.name === board.trickWinner) : -1;
    let revealed = false;
    if (first || !sameTrick) {
      const gather = !first && this.trickReviewed && this.trickWinner !== null && this.trick.length > 0;
      if (gather && motionFull()) {
        const key = ++this.collectKey;
        this.collecting = { cards: this.trick, to: this.trickWinner!, key };
        window.setTimeout(() => this.collecting?.key === key && (this.collecting = null), paced("trickCollect") + 80);
      }
      this.trickWinner = null;
      this.trickReviewed = false;
      this.trick = cards.slice(0, alreadyShown).map((card, index) => ({ key: cardKey(card), card, seat: (leader + index) % 4, fly: false }));
      if (gather) {
        revealed = true;
        if (motionFull()) {
          sfx.play("collect");
          await pause(paced("trickCollect"));
          if (gen !== this.gen) return revealed;
        }
      }
    }
    for (let index = alreadyShown; index < cards.length; index += 1) {
      if (index > alreadyShown) await pause(paced("trickReveal"));
      if (gen !== this.gen) return revealed;
      const card = cards[index];
      const seat = (leader + index) % 4;
      if (this.trick.some((item) => item.key === keys[index])) continue;
      this.trick = [...this.trick, { key: keys[index], card, seat, fly: true }];
      this.seats = this.seats.map((item) => (item.index === seat && item.index !== this.viewer && item.cardCount > board.seats[seat].cardCount ? { ...item, cardCount: board.seats[seat].cardCount } : item));
      sfx.play("card");
      if (seat === this.viewer) buzz("card");
      revealed = true;
    }
    if (revealed && cards.length > alreadyShown) await pause(paced("trickReveal"));
    if (gen !== this.gen) return revealed;
    if (reviewing && winnerIndex >= 0) {
      if (revealed) await pause(150);
      if (gen !== this.gen) return revealed;
      const fresh = this.trickWinner !== winnerIndex;
      this.trickWinner = winnerIndex;
      this.trickReviewed = true;
      this.trickPoints = board.trickPoints;
      if (fresh && revealed) {
        const ours = winnerIndex % 2 === this.viewer % 2;
        sfx.play(ours ? "trickWin" : "trickLose");
        if (ours) buzz("trick");
      }
    }
    return revealed;
  }

  // A completed trick is gathered once it has been on the table long enough to be seen. Online, the server collects it:
  // the table asks for the newer state once the time is up.
  private collectLater(completed: number): void {
    const key = `${this.id}:${completed}`;
    if (this.pendingCollection === key) return;
    this.pendingCollection = key;
    window.setTimeout(async () => {
      if (this.pendingCollection !== key || !this.shown()) return;
      this.pendingCollection = "";
      if (this.online) {
        this.loadOnline({ fresh: true });
        return;
      }
      try {
        await api.act(this.id, { type: "continueTrick" });
      } catch {
        // The trick was already collected; the table is up to date.
      }
      this.loadSolo();
    }, paced("trickHold"));
  }

  async play(item: HandCard, from: Element | null): Promise<void> {
    if (!this.handLive || this.playing) return;
    if (!this.legal.includes(item.key)) {
      this.refuse(item.key);
      return;
    }
    this.clearHint();
    const box = boxOf(from);
    if (box) this.handOrigins.set(item.key, { box, at: performance.now() });
    this.playing = item.key;
    this.handLive = false;
    const declare = Boolean(this.declare) && this.declareOn;
    if (this.online) {
      await this.onlineAction({ type: "card", rank: item.card.rank, suit: item.card.suit, declare });
      this.playing = null;
      return;
    }
    try {
      await api.act(this.id, { type: "card", rank: item.card.rank, suit: item.card.suit, declare });
      this.loadSolo();
    } catch (error) {
      this.playing = null;
      this.handLive = true;
      this.flash((error as Error).message);
    }
  }

  // Tapping a card that cannot be played explains why; it never sends a move.
  refuse(key: string): void {
    const entry = this.illegal[key];
    if (!entry) return;
    const { key: text, suit } = reasonText(entry, this.trump);
    sfx.play("refuse");
    buzz("refuse");
    this.flash(t(text, suit ? suitName(suit, false) : ""));
  }

  // The origin box of a card the player just tapped, used once, if fresh.
  takeOrigin(key: string): Box | null {
    const origin = this.handOrigins.get(key);
    this.handOrigins.delete(key);
    return origin && performance.now() - origin.at < 5000 ? origin.box : null;
  }

  private renderChips(board: Board): void {
    const { declare, chips } = tableChips(board, {
      own: (own) => t("Declare: {0}", own.map(announcementName).join(", ")),
      name: announcementName,
      detail: (player, announcement) => `${playerName(player)}: ${announcementName(announcement)}`
    });
    // A new round switches the declaration on again.
    if (!this.declare && declare) this.declareOn = true;
    this.declare = declare;
    this.chips = chips;
  }

  // ------------------------------------------------------------------ the round and the match
  private async presentRound(snapshot: Snapshot, revealed: boolean, gen: number): Promise<void> {
    const board = snapshot.board!;
    const match = snapshot.match!;
    const round = board.roundResult!;
    if (revealed) await pause(500);
    if (gen !== this.gen) return;
    this.round = {
      title: match.complete ? t("{0} win the match!", t(match.winner ?? "")) : t(round.contractMade ? "Contract made" : "Contract failed"),
      made: round.contractMade,
      breakdown: roundScoreText(round, board),
      next: !match.complete,
      results: match.complete,
      review: Boolean(round.review?.length),
      northSouth: round.northSouthAwarded,
      eastWest: round.eastWestAwarded
    };
    const myTeam = board.currentPlayerIndex % 2;
    if (revealed) {
      const moments = momentsForRound({ round, board, match, myTeam });
      if (moments) this.celebrate(moments.sticker, moments.chips);
      else {
        const ours = myTeam === 0 ? round.northSouthAwarded : round.eastWestAwarded;
        const theirs = myTeam === 0 ? round.eastWestAwarded : round.northSouthAwarded;
        sfx.play(match.complete || ours < theirs ? "roundLose" : "roundWin");
      }
    }
    if (!match.complete) return;
    const model = matchEndModel({ match, seats: board.seats, myTeam });
    if (!model) return;
    model.solo = !this.online;
    model.rematch = rematchView(match, board.seats, this.online ? (snapshot.you ?? board.currentPlayerIndex) : board.currentPlayerIndex);
    if (this.matchEndLast) this.matchEndLast.rematch = model.rematch;
    if (this.matchEndShown) {
      if (this.matchEnd) this.matchEnd = { ...this.matchEnd, rematch: model.rematch };
      return;
    }
    if (this.matchEndDismissed) return;
    if (revealed) await pause(model.iWon ? 1900 : 500);
    if (gen !== this.gen || this.matchEndShown || this.matchEndDismissed) return;
    const signature = `bot:${this.id}:${match.northSouth}-${match.eastWest}`;
    model.goal = goalOutcome(signature, model.iWon, revealed);
    // A guest who has just finished a match is offered an account now and then (US-115), never on coming back to it.
    if (revealed && !account.signedIn) {
      this.offer = countMatch(this.offer, signature);
      saveOffer(localStorage, this.offer);
      model.offer = shouldOffer(this.offer, account.signedIn);
    }
    this.openMatchEnd(model, revealed);
  }

  private openMatchEnd(model: MatchEndModel, animate: boolean): void {
    this.review = null;
    this.matchEndShown = true;
    this.matchEndLast = model;
    this.matchEndAnimate = animate;
    this.matchEnd = model;
    if (animate && (model.iWon || model.goal?.celebration)) {
      sfx.play("matchWin");
      buzz("win");
      if (settings.effects !== "off") burst("large-confetti");
    }
  }

  dismissMatchEnd(): void {
    this.matchEndDismissed = true;
    this.matchEndShown = false;
    this.matchEnd = null;
  }

  reopenMatchEnd(): void {
    if (!this.matchEndLast) return;
    this.matchEndDismissed = false;
    this.openMatchEnd(this.matchEndLast, false);
  }

  private resetMatchEnd(): void {
    this.matchEndDismissed = false;
    this.matchEndShown = false;
    this.matchEndLast = null;
    this.matchEnd = null;
  }

  dismissOffer(): void {
    this.offer = dismissOffer(this.offer);
    saveOffer(localStorage, this.offer);
    if (this.matchEnd) this.matchEnd = { ...this.matchEnd, offer: false };
  }

  async nextRound(): Promise<void> {
    this.round = null;
    if (this.online) {
      await this.onlineAction({ type: "nextRound" });
      return;
    }
    try {
      await api.act(this.id, { type: "nextRound" });
    } catch (error) {
      this.flash((error as Error).message);
      return;
    }
    lastDealKey = "";
    navigate(`/play/bot/bidding/${this.id}`);
  }

  async rematch(): Promise<void> {
    this.resetMatchEnd();
    if (this.online) {
      await this.onlineAction({ type: "rematch" });
      return;
    }
    this.round = null;
    try {
      await api.act(this.id, { type: "rematch" });
    } catch (error) {
      this.flash((error as Error).message);
      return;
    }
    lastDealKey = "";
    navigate(`/play/bot/bidding/${this.id}`);
  }

  // The review of the round that just ended (US-066), with the costly cards (US-067) and the bots' reasons (US-149); the
  // server refuses both where several humans share the table, and the review then shows none.
  openReview(): void {
    this.review = { open: true, analysis: undefined, explanations: null };
    // `$state` hands back a proxy of what is assigned: the answers are written into that one, and only while it is open.
    const opened = this.review;
    api.analysis(this.id).then(
      (analysis) => this.review === opened && (opened.analysis = analysis),
      () => this.review === opened && (opened.analysis = null)
    );
    api.explanations(this.id).then(
      (explanations) => this.review === opened && (opened.explanations = explanations),
      () => {}
    );
  }

  closeReview(): void {
    this.review = null;
  }

  // ------------------------------------------------------------------ celebrations, bots and reactions
  celebrate(kind: MomentKind, chips: MomentChip[]): void {
    const moment = MOMENTS[kind];
    this.celebration = { kind, chips, key: Date.now() };
    sfx.play(moment.sound as SoundName);
    if (moment.effect !== "none" && settings.effects !== "off") burst(moment.effect === "stars" ? "stars" : moment.effect);
    if (kind === "belote" || kind === "rebelote") {
      if (settings.effects !== "off") burst("sparks", window.innerWidth / 2, window.innerHeight * 0.45);
    }
    window.setTimeout(() => {
      if (this.celebration?.kind === kind) this.celebration = null;
    }, 1900);
  }

  private comment(events: any[], seats: any[]): void {
    const enabled = settings.botComments;
    const board = { seats };
    const greeting = events.find((event) => event.type === "greeting");
    if (greeting && markGreeted(this.id) && enabled) {
      const greeter = greetingFor(greeting, board, isBotName, botCharacter, this.botComment.count++);
      if (greeter) this.showBotLine(greeter.seat, greeter.text);
    }
    const rest = events.filter((event) => event !== greeting);
    if (!rest.length) return;
    if (enabled) {
      const picked = commentFor(this.botComment, rest, board, isBotName, botCharacter, this.botComment.count++);
      if (picked) this.showBotLine(picked.seat, picked.text);
    } else if (rest.some((event) => event.type === "round" || event.type === "match")) {
      this.botComment.shown = false;
      this.botComment.trickShown = false;
    }
  }

  private showBotLine(seat: number, text: string): void {
    window.clearTimeout(this.botComment.timer);
    this.botLine = { seat, text: t(text), key: Date.now() };
    this.botComment.timer = window.setTimeout(() => (this.botLine = null), 3000);
  }

  clearBotLine(): void {
    window.clearTimeout(this.botComment.timer);
    this.botLine = null;
  }

  private loadReactions(snapshot: Snapshot): void {
    const firstLoad = !this.reactionsSeen.loaded;
    this.reactionsSeen.loaded = true;
    for (const item of snapshot.reactions ?? []) {
      if (item.sequence <= this.reactionsSeen.sequence) continue;
      if (!firstLoad) this.showReaction(item.position, item.reaction);
      this.reactionsSeen.sequence = item.sequence;
    }
  }

  showReaction(seat: number, reaction: string): void {
    const label = REACTIONS[reaction];
    if (!label || !settings.reactions) return;
    const key = ++this.bubbleKey;
    this.bubbles = [...this.bubbles.filter((bubble) => bubble.seat !== seat), { seat, text: `${label[0]} ${t(label[1])}`, key }];
    sfx.play("reaction");
    window.setTimeout(() => (this.bubbles = this.bubbles.filter((bubble) => bubble.key !== key)), 4000);
  }

  async react(reaction: string): Promise<void> {
    this.reactions.tray = window.matchMedia("(min-width: 1024px)").matches;
    try {
      const snapshot = await api.act(this.id, { type: "react", reaction });
      const sent = snapshot.reactions.filter((item) => item.position === snapshot.you).at(-1);
      if (!sent) return;
      this.showReaction(sent.position, sent.reaction);
      this.reactionsSeen.sequence = Math.max(this.reactionsSeen.sequence, sent.sequence);
    } catch (error) {
      this.flash((error as Error).message);
    }
  }

  // ------------------------------------------------------------------ hints and undo
  private offerHint(offered: boolean): void {
    this.clearHint();
    this.hintAvailable = offered;
  }

  clearHint(): void {
    this.hintCard = null;
    this.hintBid = null;
    this.hintReason = "";
    if (this.toaster.current()?.kind === "hint") this.toaster.clear();
  }

  async askHint(): Promise<void> {
    if (!this.hintAvailable) return;
    try {
      const hint: Hint = await api.hint(this.id);
      this.clearHint();
      const reason = hint.reason === "TAKE" ? t("Take: strong hand in {0}", suitName(hint.action?.suit, false)) : t(HINT_REASONS[hint.reason] ?? hint.reason);
      if (hint.type === "bid" && hint.action) {
        this.hintBid = hint.action;
        this.hintReason = reason;
      } else if (hint.card) {
        this.hintCard = cardKey(hint.card);
        this.pushToast(reason, "hint");
      }
    } catch {
      // A failed request shows nothing new.
    }
  }

  // The Undo button of a solo table (US-146): shown for a few seconds after a card, with the undos the match has left.
  private offerUndo(offered: boolean, left: number, key: string): void {
    if (!offered || !left) {
      this.hideUndo();
      return;
    }
    this.undo = { left };
    if (this.undoKey === key) return;
    window.clearTimeout(this.undoTimer);
    this.undoKey = key;
    this.undoTimer = window.setTimeout(() => this.hideUndo(), UNDO_SHOWN_MS);
  }

  private hideUndo(): void {
    window.clearTimeout(this.undoTimer);
    this.undoKey = "";
    this.undo = null;
  }

  async takeBack(): Promise<void> {
    this.hideUndo();
    this.pendingCollection = "";
    try {
      await api.act(this.id, { type: "undo" });
    } catch (error) {
      this.flash((error as Error).message);
    }
    this.trickSeen = false;
    this.loadSolo();
  }

  // ------------------------------------------------------------------ the online lobby (US-121)
  private presentLobby(snapshot: Snapshot): void {
    ++this.gen;
    const table = snapshot.table;
    this.stage = "lobby";
    this.auction = null;
    this.round = null;
    this.trick = [];
    this.hand = [];
    this.chips = [];
    this.declare = null;
    this.hintAvailable = false;
    this.score = null;
    this.reactions.allowed = false;
    this.toaster.clear();
    const you = table.seats.find((seat) => seat.you);
    this.viewer = you?.position ?? 0;
    this.seats = [0, 1, 2, 3].map((index) => {
      const seat = table.seats.find((item) => item.position === index);
      return { index, name: seat?.name ?? "", team: TEAMS[index % 2], cardCount: 0, active: false, dealer: false, call: null, callFresh: 0, stale: false, thinking: false };
    });
    this.setStatus(t(table.publicTable ? "Public table" : "Private table"));
    const model = lobbyModel(table);
    const message = this.lobby?.message ?? "";
    this.lobby = { model, table, countdown: "", message };
    this.stopCountdown();
    if (model.publicWaiting && table.botFillAt) {
      const tick = () => {
        if (!this.shown()) return this.stopCountdown();
        const secondsLeft = Math.max(0, Math.ceil((Date.parse(table.botFillAt!) - Date.now()) / 1000));
        if (this.lobby) this.lobby.countdown = t("Looking for players… bots take the empty seats in {0} s.", secondsLeft);
      };
      tick();
      this.countdownTimer = window.setInterval(tick, 1000);
    }
  }

  private stopCountdown(): void {
    window.clearInterval(this.countdownTimer);
    this.countdownTimer = 0;
  }

  private lobbyMessage(text: string): void {
    if (this.lobby) this.lobby.message = text;
    else this.flash(text);
  }

  // One action at an online table, then the table as the server holds it.
  async onlineAction(action: Parameters<typeof api.act>[1]): Promise<void> {
    if (this.lobby) this.lobby.message = "";
    try {
      await api.act(this.id, action);
      await this.loadOnline();
    } catch (error) {
      const failure = error as ApiError;
      if (failure.status || failure.network) await this.loadOnline({ fresh: true });
      this.lobbyMessage(failure.message);
    }
  }

  async leavePublic(): Promise<void> {
    try {
      await api.act(this.id, { type: "leave" });
      closeTableStream();
      forgetTableSession(this.id);
      setPrivateSession(null);
      navigate("/online/public");
    } catch (error) {
      this.lobbyMessage((error as Error).message);
    }
  }

  // ------------------------------------------------------------------ leaving (US-110)
  askToLeave(destination: string): boolean {
    const question = leaveConfirmation({ kind: this.leaveKind, matchComplete: this.matchComplete });
    if (!question) return false;
    this.leave = { open: true, title: t(question.title), message: t(question.message), destination };
    return true;
  }

  confirmLeave(): void {
    const destination = this.leave.destination;
    this.leave = { ...this.leave, open: false };
    setLeaveGuard(null);
    navigate(destination);
  }
}
