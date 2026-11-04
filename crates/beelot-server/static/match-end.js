// The end-of-match screen (US-093): what it shows, from the match and the table's seats. The page draws it.
// `match` is the snapshot's `{ complete, winner, northSouth, eastWest, recap }`; `seats` is `board.seats`
// (`{ name, team }`); `myTeam` is 0 for North–South, 1 for East–West and null when the viewer sits in neither.

const MATCH_END_TEAMS = ["North–South", "East–West"];
const ANNOUNCEMENT_KINDS = ["tierce", "cinquante", "cent", "carre"];

// The model of the screen, or null when the match has not finished or carries no recap:
// `{ winner, iWon, podium, recap }`. `podium` is the winner then the other team, each
// `{ place, team, names, score }`; `recap.announcements` is North–South then East–West, each team's scored
// announcements as `{ kind, count }` without the zeros.
function matchEndModel({ match, seats, myTeam }) {
  if (!match?.complete || !match.winner || !match.recap) return null;
  const score = (team) => (team === MATCH_END_TEAMS[0] ? match.northSouth : match.eastWest);
  const names = (team) => seats.filter((seat) => seat.team === team).map((seat) => seat.name);
  const other = match.winner === MATCH_END_TEAMS[0] ? MATCH_END_TEAMS[1] : MATCH_END_TEAMS[0];
  const items = (counts) => ANNOUNCEMENT_KINDS
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, count: counts[kind] }));
  return {
    winner: match.winner,
    iWon: (myTeam === 0 || myTeam === 1) && MATCH_END_TEAMS[myTeam] === match.winner,
    podium: [match.winner, other].map((team, index) => ({
      place: index + 1,
      team,
      names: names(team),
      score: score(team),
    })),
    recap: {
      rounds: match.recap.rounds,
      biggestRound: match.recap.biggestRound ?? null,
      announcements: [
        { team: MATCH_END_TEAMS[0], items: items(match.recap.announcements.northSouth) },
        { team: MATCH_END_TEAMS[1], items: items(match.recap.announcements.eastWest) },
      ],
    },
  };
}

if (typeof module !== "undefined") module.exports = { matchEndModel };
