package fr.beelot.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchScoreTest {

    @Test
    void endsTheMatchWhenATeamReachesOneThousandPoints() {
        MatchScore score = new MatchScore();
        GameBoard.RoundResult round = round(1_000, 0);

        score.record(round);

        assertEquals(1_000, score.northSouth());
        assertTrue(score.complete());
        assertEquals("North–South", score.winner());
    }

    @Test
    void theMatchGoesOnBelowOneThousandPoints() {
        MatchScore score = new MatchScore();

        score.record(round(500, 162));
        score.record(round(490, 0));

        assertEquals(990, score.northSouth());
        assertFalse(score.complete());
        assertEquals("", score.winner());
    }

    @Test
    void whenBothTeamsPassOneThousandTheHigherScoreWins() {
        MatchScore score = new MatchScore();
        score.record(round(950, 900));

        score.record(round(60, 162));

        assertTrue(score.complete());
        assertEquals("East–West", score.winner());
    }

    @Test
    void anExactTieAboveOneThousandIsSettledByAnotherRound() {
        MatchScore score = new MatchScore();
        score.record(round(950, 950));

        score.record(round(81, 81));
        assertFalse(score.complete(), "a tie at 1,031 has no winner yet");

        score.record(round(162, 0));
        assertTrue(score.complete());
        assertEquals("North–South", score.winner());
    }

    @Test
    void roundsAfterTheEndOfTheMatchAreIgnored() {
        MatchScore score = new MatchScore();
        score.record(round(0, 1_000));

        score.record(round(500, 0));

        assertEquals(0, score.northSouth());
        assertEquals("East–West", score.winner());
    }

    @Test
    void keepsTheRoundsAndSaysOnceThatTheMatchHasEnded() {
        MatchScore score = new MatchScore();
        GameBoard.RoundSummary first = summary(round(600, 0));
        GameBoard.RoundSummary second = summary(round(500, 100));

        assertFalse(score.record(first));
        assertTrue(score.record(second), "this round ends the match");
        assertFalse(score.record(summary(round(0, 162))), "a won match takes no more rounds");

        assertEquals(java.util.List.of(first, second), score.rounds());
        assertEquals(1_100, score.northSouth());
    }

    @Test
    void eachMatchHasItsOwnId() {
        assertNotEquals(new MatchScore().id(), new MatchScore().id());
    }

    private static GameBoard.RoundSummary summary(GameBoard.RoundResult result) {
        return new GameBoard.RoundSummary("North–South", GameCard.Suit.HEARTS, 80, false, result);
    }

    private static GameBoard.RoundResult round(int northSouthAwarded, int eastWestAwarded) {
        return new GameBoard.RoundResult(0, 0, 0, 0, 0, 0, true, northSouthAwarded, eastWestAwarded, "");
    }
}
