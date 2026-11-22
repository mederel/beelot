// The score bar above the table: each team's match score, the points of the round in progress and the score to reach.
// A team is `{ name, matchScore, roundPoints, progress, mine }`, with `roundPoints` null while no board is played and
// `progress` the match score as a share of the target, from 0 to 1.
import type { Board, Match } from "$lib/api/types";

export interface ScoreTeam {
  name: "North–South" | "East–West";
  matchScore: number;
  roundPoints: number | null;
  progress: number;
  mine: boolean;
}

export interface ScoreBarModel {
  teams: [ScoreTeam, ScoreTeam];
  target: number;
  complete: boolean;
}

// `myTeam` is 0 for North–South, 1 for East–West and null when the viewer sits in neither.
export function scoreBarModel({ match, board, myTeam }: { match: Match | null | undefined; board: Pick<Board, "northSouthScore" | "eastWestScore"> | null | undefined; myTeam: number | null }): ScoreBarModel | null {
  if (match == null) return null;
  const usableTarget = Number.isFinite(match.target) && match.target > 0;
  const progress = (score: number) => (usableTarget && Number.isFinite(score) ? Math.min(1, Math.max(0, score / match.target)) : 0);
  const round = (points: number | undefined) => (board == null ? null : (points ?? null));
  return {
    teams: [
      { name: "North–South", matchScore: match.northSouth, roundPoints: round(board?.northSouthScore), progress: progress(match.northSouth), mine: myTeam === 0 },
      { name: "East–West", matchScore: match.eastWest, roundPoints: round(board?.eastWestScore), progress: progress(match.eastWest), mine: myTeam === 1 }
    ],
    target: match.target,
    complete: Boolean(match.complete)
  };
}

// Words the match score for a live region; round points change too often, so they are left out.
export function scoreBarAnnouncement(model: ScoreBarModel, t: (text: string, ...args: unknown[]) => string, format: (value: number) => string): string {
  const [northSouth, eastWest] = model.teams;
  return t("Match score: North–South {0}, East–West {1}, to {2}.", format(northSouth.matchScore), format(eastWest.matchScore), format(model.target));
}

// The integer shown at progress `t` (0 to 1) of a count from `from` up to `to`, easing out. It never exceeds `to`, and
// shows `to` at once when there is nothing to count up.
export function countValue(from: number, to: number, t: number): number {
  if (from >= to || t >= 1) return to;
  if (!(t > 0)) return from;
  return from + Math.round((to - from) * (1 - (1 - t) ** 3));
}
