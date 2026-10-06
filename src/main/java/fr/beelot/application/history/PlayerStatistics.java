package fr.beelot.application.history;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A player's results, from the stored matches in which their account held a seat (US-059). Contracts, coinches,
 * capots, belotes and points count for the player's team.
 */
public record PlayerStatistics(Record overall, List<Record> byVariant, List<Record> byDifficulty,
                               List<RecentMatch> recentMatches, Contracts contracts, int rounds,
                               Double averagePointsPerRound) {

    static final int RECENT_MATCHES = 20;

    /** Matches played, won and lost, and the win rate in percent (null before the first match). */
    public record Record(String key, int played, int won, int lost, Integer winRate) {
    }

    public record RecentMatch(Instant endedAt, FinishedMatch.Mode mode, String variant, String difficulty,
                              String partner, List<String> opponents, int teamScore, int opponentScore,
                              boolean won) {
    }

    /**
     * Contracts the team took and made; coinches the team made against the opponents' contracts and how many
     * defeated them; coinches the opponents made against the team's contracts and how many defeated them; capots
     * and belotes the team scored.
     */
    public record Contracts(int taken, int made, int coinchesByTeam, int coinchesByTeamWon, int coinchesAgainstTeam,
                            int coinchesAgainstTeamWon, int capots, int belotes) {
    }

    /** The statistics of the account over the given matches, most recent first. */
    static PlayerStatistics of(UUID accountId, List<MatchRecord> matches) {
        Tally overall = new Tally("ALL");
        Map<String, Tally> byVariant = new LinkedHashMap<>();
        Map<String, Tally> byDifficulty = new LinkedHashMap<>();
        for (String variant : List.of("CLASSIC", "CONTREE")) byVariant.put(variant, new Tally(variant));
        for (String difficulty : List.of("RELAXED", "CHALLENGING")) byDifficulty.put(difficulty, new Tally(difficulty));
        List<RecentMatch> recent = new ArrayList<>();
        int taken = 0, made = 0, coinchesBy = 0, coinchesByWon = 0, coinchesAgainst = 0, coinchesAgainstWon = 0;
        int capots = 0, belotes = 0, rounds = 0, points = 0;
        for (MatchRecord match : matches) {
            List<SeatRecord> seats = match.seats();
            int position = positionOf(accountId, seats);
            if (position < 0) continue;
            Team team = seats.get(position).team();
            boolean won = match.winningTeam() == team;
            overall.add(won);
            byVariant.computeIfAbsent(match.variant(), Tally::new).add(won);
            if (match.mode() == FinishedMatch.Mode.SOLO && match.difficulty() != null) {
                byDifficulty.computeIfAbsent(match.difficulty(), Tally::new).add(won);
            }
            if (recent.size() < RECENT_MATCHES) recent.add(recentMatch(match, seats, position, team, won));
            for (RoundRecord round : match.rounds()) {
                boolean declared = round.declaringTeam() == team;
                if (declared) {
                    taken++;
                    if (round.contractMade()) made++;
                }
                if (round.coinched() && !declared) {
                    coinchesBy++;
                    if (!round.contractMade()) coinchesByWon++;
                }
                if (round.coinched() && declared) {
                    coinchesAgainst++;
                    if (!round.contractMade()) coinchesAgainstWon++;
                }
                if (round.capotTeam() == team) capots++;
                if (round.beloteTeam() == team) belotes++;
                rounds++;
                points += team == Team.NORTH_SOUTH ? round.northSouthPoints() : round.eastWestPoints();
            }
        }
        Double average = rounds == 0 ? null : Math.round(10.0 * points / rounds) / 10.0;
        return new PlayerStatistics(overall.record(), records(byVariant), records(byDifficulty), recent,
                new Contracts(taken, made, coinchesBy, coinchesByWon, coinchesAgainst, coinchesAgainstWon, capots,
                        belotes), rounds, average);
    }

    private static int positionOf(UUID accountId, List<SeatRecord> seats) {
        for (int position = 0; position < seats.size(); position++) {
            if (accountId.equals(seats.get(position).accountId())) return position;
        }
        return -1;
    }

    private static RecentMatch recentMatch(MatchRecord match, List<SeatRecord> seats, int position, Team team,
                                           boolean won) {
        boolean northSouth = team == Team.NORTH_SOUTH;
        return new RecentMatch(match.endedAt(), match.mode(), match.variant(), match.difficulty(),
                seats.get((position + 2) % 4).name(),
                List.of(seats.get((position + 1) % 4).name(), seats.get((position + 3) % 4).name()),
                northSouth ? match.northSouthScore() : match.eastWestScore(),
                northSouth ? match.eastWestScore() : match.northSouthScore(), won);
    }

    private static List<Record> records(Map<String, Tally> tallies) {
        return tallies.values().stream().map(Tally::record).toList();
    }

    private static final class Tally {

        private final String key;
        private int played;
        private int won;

        Tally(String key) {
            this.key = key;
        }

        void add(boolean win) {
            played++;
            if (win) won++;
        }

        Record record() {
            return new Record(key, played, won, played - won,
                    played == 0 ? null : (int) Math.round(100.0 * won / played));
        }
    }
}
