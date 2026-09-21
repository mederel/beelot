package fr.beelot.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchScoreTest {

    @Test
    void endsTheMatchWhenATeamReachesOneThousandPoints() {
        MatchScore score = new MatchScore();
        GameBoard.RoundResult round = new GameBoard.RoundResult(900, 0, 10, 0, 0, 0, true, 1_000, 0);

        score.record(round);

        assertEquals(1_000, score.northSouth());
        assertTrue(score.complete());
        assertEquals("North–South", score.winner());
    }
}
