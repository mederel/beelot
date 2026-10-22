package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchScoreTest {

    @Test
    void eachTargetEndsTheMatchWhenReached() {
        for (int target : MatchScore.TARGETS) {
            MatchScore score = new MatchScore(target);
            int rounds = 0;
            while (!score.complete()) {
                assertTrue(score.northSouth() < target, "the match went on past " + target);
                score.record(round(250, 0));
                rounds++;
            }
            assertEquals(target, score.target());
            assertEquals((target + 249) / 250, rounds, "rounds to reach " + target);
        }
    }

    @Test
    void aTieAtTheTargetPlaysOn() {
        MatchScore score = new MatchScore(500);

        score.record(round(520, 520));
        assertFalse(score.complete());
        score.record(round(10, 0));

        assertTrue(score.complete());
        assertEquals("North–South", score.winner());
    }

    @Test
    void anInvalidTargetIsRefused() {
        InvalidMatchTargetException refusal = assertThrows(InvalidMatchTargetException.class, () -> new MatchScore(750));

        assertEquals("The match target must be 500, 1,000, 1,500 or 2,000 points.", refusal.getMessage());
        assertEquals(1_000, new MatchScore().target());
    }

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
        return new GameBoard.RoundResult(0, 0, 0, 0, 0, 0, true, northSouthAwarded, eastWestAwarded, "", 0, 0, List.of());
    }
}
