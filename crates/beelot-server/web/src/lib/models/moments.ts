// The big moments of a round (US-090), the end-of-match screen (US-093), the rematch (US-114) and the round review
// (US-066): what to celebrate and show, from the snapshot. No DOM: the components draw them.
import type { BoardSeat, Card, Match, ReviewTrick, TeamName } from "$lib/api/types";
import type { Coded } from "$lib/i18n/types";

const NORTH_SOUTH = "North–South";
const EAST_WEST = "East–West";

export type MomentKind = "matchWin" | "capot" | "coincheWon" | "defended" | "roundWon" | "contractLost" | "belote" | "rebelote";

// Each moment's sticker text, effect and sound (a name of the sound kit).
export const MOMENTS: Record<MomentKind, { text: string; effect: "large-confetti" | "confetti" | "stars" | "light-confetti" | "none"; sound: string }> = {
  matchWin: { text: "Victory!", effect: "large-confetti", sound: "matchWin" },
  capot: { text: "Capot!", effect: "confetti", sound: "capot" },
  coincheWon: { text: "Coinche!", effect: "stars", sound: "coincheWon" },
  defended: { text: "Down!", effect: "confetti", sound: "defended" },
  roundWon: { text: "Round won!", effect: "light-confetti", sound: "roundWin" },
  contractLost: { text: "Down!", effect: "none", sound: "contractLost" },
  belote: { text: "Belote!", effect: "none", sound: "belote" },
  rebelote: { text: "Rebelote!", effect: "none", sound: "belote" }
};

const ROUND_PRIORITY: MomentKind[] = ["matchWin", "capot", "coincheWon", "defended", "roundWon"];
const CAPOT_POINTS = 250;

export interface MomentChip {
  kind: MomentKind | "belote" | "points";
  text: string;
}

// Reads a round end into `{ sticker, chips }`: the highest-priority moment of the viewer's team as the sticker and the
// others as chips. Null when nothing is worth celebrating. A contract the viewer's team failed is the only sticker, with at
// most the belote chip. `myTeam` is 0 for North–South, 1 for East–West and null when the viewer sits in neither.
export function momentsForRound({
  round,
  board,
  match,
  myTeam
}: {
  round: any;
  board: any;
  match: Match | null | undefined;
  myTeam: number | null;
}): { sticker: MomentKind; chips: MomentChip[] } | null {
  if (myTeam !== 0 && myTeam !== 1) return null;
  const mine = myTeam === 0 ? NORTH_SOUTH : EAST_WEST;
  const ours = myTeam === 0 ? round.northSouthAwarded : round.eastWestAwarded;
  const theirs = myTeam === 0 ? round.eastWestAwarded : round.northSouthAwarded;
  const beloteBonus = myTeam === 0 ? round.northSouthBeloteBonus : round.eastWestBeloteBonus;
  const declaringMine = board.declaringTeam === mine;
  const beloteChip: MomentChip[] = beloteBonus > 0 ? [{ kind: "belote", text: "Belote ✓" }] : [];

  // A lost match gets no sticker, whatever the last round was.
  if (match?.complete && match.winner !== mine) return null;
  if (declaringMine && !round.contractMade) return { sticker: "contractLost", chips: beloteChip };

  const applies: Record<string, boolean> = {
    matchWin: Boolean(match?.complete) && match!.winner === mine,
    capot: round.capotTeam === mine,
    coincheWon: Boolean(board.coinched) && (declaringMine ? round.contractMade : !round.contractMade),
    defended: !declaringMine && !round.contractMade && !board.coinched,
    roundWon: ours >= theirs
  };
  const [sticker, ...rest] = ROUND_PRIORITY.filter((kind) => applies[kind]);
  if (sticker === undefined) return null;
  const chips: MomentChip[] = rest.map((kind) => ({ kind, text: MOMENTS[kind].text }));
  if (applies.capot) {
    const bid = board.variant === "CONTREE" && declaringMine ? board.contractValue : 0;
    chips.push({ kind: "points", text: `+${CAPOT_POINTS + bid}` });
  }
  return { sticker, chips: [...chips, ...beloteChip] };
}

// The belote or rebelote a declaration announces, as `{ kind, team }`, or null. A declaration is the server's
// `declarationCode`, naming the player; the team is that of the seat with this name.
const DECLARATION_KINDS: Record<string, "belote" | "rebelote"> = { "declared-belote": "belote", "declared-rebelote": "rebelote" };

function beloteDeclaration(declaration: Coded | null | undefined, seats: Pick<BoardSeat, "name" | "team">[]) {
  const kind = declaration?.code ? DECLARATION_KINDS[declaration.code] : undefined;
  const declarer = kind && seats.find((seat) => seat.name === declaration?.params?.name);
  return kind && declarer ? { kind, team: declarer.team } : null;
}

const declarationKey = (declaration: Coded | null | undefined) => (declaration ? `${declaration.code}|${declaration.params?.name ?? ""}` : "");

// Follows one game's declarations: `watch(...)` returns the belote or rebelote to celebrate now, or null. The first
// declaration seen is ignored (a reload mid-round). A declaration is remembered until a viewer of the declaring team looks,
// so in pass-and-play the declarer's team still sees it on their turn; a new or empty declaration drops it.
export function createBeloteWatcher() {
  let seen = false;
  let last = "";
  let pending: { kind: "belote" | "rebelote"; team: string } | null = null;
  return {
    watch({
      declaration,
      seats,
      myTeam
    }: {
      declaration: Coded | null | undefined;
      seats: Pick<BoardSeat, "name" | "team">[];
      myTeam: number | null;
    }): "belote" | "rebelote" | null {
      const key = declarationKey(declaration);
      if (!seen) {
        seen = true;
        last = key;
        return null;
      }
      if (key !== last) {
        last = key;
        pending = beloteDeclaration(declaration, seats);
      }
      if (pending && (myTeam === 0 || myTeam === 1) && pending.team === (myTeam === 0 ? NORTH_SOUTH : EAST_WEST)) {
        const { kind } = pending;
        pending = null;
        return kind;
      }
      return null;
    }
  };
}

const MATCH_END_TEAMS: TeamName[] = ["North–South", "East–West"];
const ANNOUNCEMENT_KINDS = ["tierce", "cinquante", "cent", "carre"] as const;

export interface MatchEndModel {
  winner: TeamName;
  iWon: boolean;
  podium: { place: number; team: TeamName; names: string[]; score: number }[];
  recap: {
    rounds: number;
    biggestRound: { round: number; team: TeamName; points: number } | null;
    announcements: { team: TeamName; items: { kind: (typeof ANNOUNCEMENT_KINDS)[number]; count: number }[] }[];
  };
  solo?: boolean;
  rematch?: RematchView;
  goal?: { celebration: "firstWin" | "firstGame" | null; message: string } | null;
  offer?: boolean;
}

// The model of the screen, or null when the match has not finished or carries no recap.
export function matchEndModel({
  match,
  seats,
  myTeam
}: {
  match: Match | null | undefined;
  seats: Pick<BoardSeat, "name" | "team">[];
  myTeam: number | null;
}): MatchEndModel | null {
  if (!match?.complete || !match.winner || !match.recap) return null;
  const recap = match.recap;
  const score = (team: TeamName) => (team === MATCH_END_TEAMS[0] ? match.northSouth : match.eastWest);
  const names = (team: TeamName) => seats.filter((seat) => seat.team === team).map((seat) => seat.name);
  const winner = match.winner;
  const other = winner === MATCH_END_TEAMS[0] ? MATCH_END_TEAMS[1] : MATCH_END_TEAMS[0];
  const items = (counts: Record<string, number>) => ANNOUNCEMENT_KINDS.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] }));
  return {
    winner,
    iWon: (myTeam === 0 || myTeam === 1) && MATCH_END_TEAMS[myTeam] === winner,
    podium: [winner, other].map((team, index) => ({ place: index + 1, team, names: names(team), score: score(team) })),
    recap: {
      rounds: recap.rounds,
      biggestRound: recap.biggestRound ?? null,
      announcements: [
        { team: MATCH_END_TEAMS[0], items: items(recap.announcements.northSouth) },
        { team: MATCH_END_TEAMS[1], items: items(recap.announcements.eastWest) }
      ]
    }
  };
}

export interface RematchView {
  state: "idle" | "waiting" | "proposed";
  names: string[];
}

// The rematch proposal of an online table (US-114), seen by the seat `you`.
export function rematchView(match: Match | null | undefined, seats: { name: string }[], you: number): RematchView {
  const voted = match?.rematchVoted ?? [];
  const named = (positions: number[]) => positions.map((position) => seats[position]?.name).filter(Boolean);
  if (voted.length === 0) return { state: "idle", names: [] };
  if (voted.includes(you)) return { state: "waiting", names: named(match?.rematchPending ?? []) };
  return { state: "proposed", names: named(voted) };
}

// The texts of the primary button and of the status line under it for a rematch view.
export function rematchTexts(view: RematchView, translate: (text: string, ...args: unknown[]) => string) {
  const names = view.names.join(", ");
  if (view.state === "waiting") return { label: translate("Play again"), status: translate("Waiting for {0}…", names), disabled: true };
  if (view.state === "proposed") return { label: translate("Accept rematch"), status: translate("Rematch proposed by {0}", names), disabled: false };
  return { label: translate("Play again"), status: "", disabled: false };
}

export interface ReviewStep {
  step: number;
  steps: number;
  trick: { seat: number; card: Card }[];
  winner: number | null;
  hands: Card[][];
}

// The model of one step of the review, or null when there is no review. Step 0 is the deal (every hand complete, nothing
// on the table); step n shows trick n on the table. `hands` are the four seats' cards not yet played after the step.
export function roundReviewModel({ review, step = 0 }: { review: ReviewTrick[] | null | undefined; step?: number }): ReviewStep | null {
  if (!Array.isArray(review) || review.length === 0) return null;
  const steps = review.length;
  const shown = Math.min(steps, Math.max(0, Math.floor(Number(step) || 0)));
  const hands: Card[][] = [[], [], [], []];
  review.forEach((trick, index) => {
    if (index < shown) return;
    for (const { seat, card } of trick.cards) hands[seat].push(card);
  });
  const current = shown > 0 ? review[shown - 1] : null;
  return { step: shown, steps, trick: current ? current.cards : [], winner: current ? current.winner : null, hands };
}

// A belote or rebelote of the viewer's team that the board has just announced, or null. `previousDeclaration` is the
// declaration seen before for the same game, undefined when this is the first, so reloading mid-round does not celebrate.
export function momentForBelote({
  declaration,
  previousDeclaration,
  seats,
  myTeam
}: {
  declaration: Coded | null | undefined;
  previousDeclaration: Coded | null | undefined;
  seats: Pick<BoardSeat, "name" | "team">[];
  myTeam: number | null;
}): "belote" | "rebelote" | null {
  if (myTeam !== 0 && myTeam !== 1) return null;
  if (previousDeclaration === undefined || declarationKey(declaration) === declarationKey(previousDeclaration)) return null;
  const announced = beloteDeclaration(declaration, seats);
  return announced?.team === (myTeam === 0 ? NORTH_SOUTH : EAST_WEST) ? announced.kind : null;
}
