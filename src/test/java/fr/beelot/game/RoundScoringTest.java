package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The score of a round once its tricks are played (US-060): Belote and announcements count towards the contract. */
class RoundScoringTest {

    @Test
    void classicBeloteCountsTowardsTheContract() {
        GameBoard.RoundResult result = score(classic(65, 87, 10, 0, 20, 0, 5, 0, 0));

        assertTrue(result.contractMade());
        assertEquals(95, result.northSouthAwarded());
        assertEquals(87, result.eastWestAwarded());
    }

    @Test
    void classicTieFails() {
        GameBoard.RoundResult result = score(classic(61, 91, 10, 0, 20, 0, 4, 0, 0));

        assertFalse(result.contractMade());
        assertEquals(20, result.northSouthAwarded());
        assertEquals(162, result.eastWestAwarded());
    }

    @Test
    void contreeBeloteCountsTowardsTheBid() {
        GameBoard.RoundResult result = score(contree(100, false, 72, 80, 10, 0, 20, 0, 5, 0, 0));

        assertTrue(result.contractMade());
        assertEquals(102, result.northSouthAwarded());
        assertEquals(80, result.eastWestAwarded());
    }

    @Test
    void announcementsCountTowardsTheContract() {
        GameBoard.RoundResult result = score(classic(66, 86, 10, 0, 0, 0, 5, 20, 0));

        assertTrue(result.contractMade());
        assertEquals(96, result.northSouthAwarded());
        assertEquals(86, result.eastWestAwarded());
        assertEquals(20, result.northSouthAnnouncements());
        assertEquals(0, result.eastWestAnnouncements());
    }

    @Test
    void failedContractGivesTheDefenceEveryScoredAnnouncement() {
        GameBoard.RoundResult result = score(classic(40, 112, 0, 10, 0, 0, 2, 50, 0));

        assertFalse(result.contractMade());
        assertEquals(0, result.northSouthAwarded());
        assertEquals(212, result.eastWestAwarded());
    }

    @Test
    void capotAddsTheTeamsOwnAnnouncements() {
        GameBoard.RoundResult result = score(classic(152, 0, 10, 0, 0, 20, 8, 50, 0));

        assertEquals("North–South", result.capotTeam());
        assertEquals(300, result.northSouthAwarded());
        assertEquals(20, result.eastWestAwarded());
    }

    @Test
    void capotedTakerFailsWhateverItsAnnouncements() {
        GameBoard.RoundResult result = score(contree(80, false, 0, 152, 0, 10, 0, 0, 0, 200, 0));

        assertFalse(result.contractMade());
        assertEquals("East–West", result.capotTeam());
        assertEquals(0, result.northSouthAwarded());
        assertEquals(250, result.eastWestAwarded());
    }

    @Test
    void coincheDoublesBothScores() {
        GameBoard.RoundResult result = score(contree(90, true, 66, 86, 10, 0, 0, 0, 5, 20, 0));

        assertTrue(result.contractMade());
        assertEquals(192, result.northSouthAwarded());
        assertEquals(172, result.eastWestAwarded());
    }

    @Test
    void withoutAnnouncementsCardPointsDecide() {
        assertTrue(score(classic(82, 70, 0, 10, 0, 0, 5, 0, 0)).contractMade());
        assertFalse(score(classic(81, 71, 0, 10, 0, 0, 4, 0, 0)).contractMade());
    }

    /** North–South take the contract. */
    private static RoundScoring.Totals classic(int northSouthCards, int eastWestCards, int northSouthDix,
                                               int eastWestDix, int northSouthBelote, int eastWestBelote,
                                               int northSouthTricks, int northSouthAnnouncements,
                                               int eastWestAnnouncements) {
        return new RoundScoring.Totals(GameVariant.CLASSIC, true, 82, false, northSouthCards, eastWestCards,
                northSouthDix, eastWestDix, northSouthBelote, eastWestBelote, northSouthTricks,
                northSouthAnnouncements, eastWestAnnouncements);
    }

    /** North–South bid the contract. */
    private static RoundScoring.Totals contree(int bid, boolean coinched, int northSouthCards, int eastWestCards,
                                               int northSouthDix, int eastWestDix, int northSouthBelote,
                                               int eastWestBelote, int northSouthTricks,
                                               int northSouthAnnouncements, int eastWestAnnouncements) {
        return new RoundScoring.Totals(GameVariant.CONTREE, true, bid, coinched, northSouthCards, eastWestCards,
                northSouthDix, eastWestDix, northSouthBelote, eastWestBelote, northSouthTricks,
                northSouthAnnouncements, eastWestAnnouncements);
    }

    private static GameBoard.RoundResult score(RoundScoring.Totals totals) {
        return RoundScoring.score(totals, List.of());
    }
}
