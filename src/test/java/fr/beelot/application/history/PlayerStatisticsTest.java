package fr.beelot.application.history;

import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Ana plays East (seat 1) with Chloé (seat 3) against Ben and David. */
class PlayerStatisticsTest {

    private static final UUID ANA = UUID.randomUUID();

    @Test
    void countsMatchesPlayedWonAndLostOverallPerVariantAndPerSoloDifficulty() {
        List<MatchRecord> matches = List.of(
                match(FinishedMatch.Mode.SOLO, GameVariant.CONTREE, BotDifficulty.CHALLENGING, "East–West", List.of()),
                match(FinishedMatch.Mode.SOLO, GameVariant.CLASSIC, BotDifficulty.RELAXED, "North–South", List.of()),
                match(FinishedMatch.Mode.PRIVATE, GameVariant.CONTREE, null, "East–West", List.of()));

        PlayerStatistics stats = PlayerStatistics.of(ANA, matches);

        assertEquals(new PlayerStatistics.Record("ALL", 3, 2, 1, 67), stats.overall());
        assertEquals(List.of(new PlayerStatistics.Record("CLASSIC", 1, 0, 1, 0),
                new PlayerStatistics.Record("CONTREE", 2, 2, 0, 100)), stats.byVariant());
        assertEquals(List.of(new PlayerStatistics.Record("RELAXED", 1, 0, 1, 0),
                new PlayerStatistics.Record("CHALLENGING", 1, 1, 0, 100)), stats.byDifficulty());
    }

    @Test
    void showsRecentMatchesFromThePlayersSide() {
        PlayerStatistics stats = PlayerStatistics.of(ANA, List.of(
                match(FinishedMatch.Mode.PUBLIC, GameVariant.CONTREE, null, "East–West", List.of())));

        PlayerStatistics.RecentMatch recent = stats.recentMatches().getFirst();
        assertEquals("Chloé", recent.partner());
        assertEquals(List.of("David", "Ben"), recent.opponents(), "in play order after Ana");
        assertEquals(1_020, recent.teamScore());
        assertEquals(640, recent.opponentScore());
        assertEquals(true, recent.won());
        assertEquals(FinishedMatch.Mode.PUBLIC, recent.mode());
    }

    @Test
    void keepsTheTwentyMostRecentMatches() {
        List<MatchRecord> matches = new ArrayList<>();
        for (int index = 0; index < 25; index++) {
            matches.add(match(FinishedMatch.Mode.SOLO, GameVariant.CLASSIC, BotDifficulty.RELAXED, "East–West",
                    List.of()));
        }

        PlayerStatistics stats = PlayerStatistics.of(ANA, matches);

        assertEquals(25, stats.overall().played());
        assertEquals(20, stats.recentMatches().size());
    }

    @Test
    void countsContractsCoinchesCapotsBelotesAndPointsForThePlayersTeam() {
        List<GameBoard.RoundSummary> rounds = List.of(
                round("East–West", false, true, "", "East–West", 0, 120),
                round("East–West", true, false, "", "", 324, 0),
                round("North–South", true, false, "East–West", "", 0, 500),
                round("North–South", false, true, "", "North–South", 140, 42));

        PlayerStatistics stats = PlayerStatistics.of(ANA, List.of(
                match(FinishedMatch.Mode.SOLO, GameVariant.CONTREE, BotDifficulty.RELAXED, "East–West", rounds)));

        assertEquals(new PlayerStatistics.Contracts(2, 1, 1, 1, 1, 1, 1, 1), stats.contracts());
        assertEquals(4, stats.rounds());
        assertEquals((120 + 0 + 500 + 42) / 4.0, stats.averagePointsPerRound());
    }

    @Test
    void aPlayerWithoutMatchesHasNoRatesYet() {
        PlayerStatistics stats = PlayerStatistics.of(ANA, List.of());

        assertEquals(new PlayerStatistics.Record("ALL", 0, 0, 0, null), stats.overall());
        assertNull(stats.averagePointsPerRound());
    }

    private static MatchRecord match(FinishedMatch.Mode mode, GameVariant variant, BotDifficulty difficulty,
                                     String winner, List<GameBoard.RoundSummary> rounds) {
        boolean eastWestWon = winner.startsWith("East");
        FinishedMatch match = new FinishedMatch(UUID.randomUUID(), Instant.now(), mode, variant, difficulty,
                eastWestWon ? 640 : 1_010, eastWestWon ? 1_020 : 600, winner, List.of(), rounds);
        return new MatchRecord(match, List.of(new SeatRecord(null, "Ben", Team.NORTH_SOUTH, false),
                new SeatRecord(ANA, "Ana", Team.EAST_WEST, false),
                new SeatRecord(null, "David", Team.NORTH_SOUTH, true),
                new SeatRecord(null, "Chloé", Team.EAST_WEST, false)));
    }

    private static GameBoard.RoundSummary round(String declaringTeam, boolean coinched, boolean made, String capotTeam,
                                                String beloteTeam, int northSouth, int eastWest) {
        return new GameBoard.RoundSummary(declaringTeam, GameCard.Suit.SPADES, 100, coinched,
                new GameBoard.RoundResult(0, 0, 0, 0, beloteTeam.startsWith("North") ? 20 : 0,
                        beloteTeam.startsWith("East") ? 20 : 0, made, northSouth, eastWest, capotTeam));
    }
}
