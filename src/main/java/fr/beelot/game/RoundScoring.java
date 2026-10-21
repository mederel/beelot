package fr.beelot.game;

import java.util.List;

/**
 * The score of a round once its tricks are played, FFB-style (US-060). A team's total is its card points, dix de der,
 * Belote and announcements, and the taker's total decides the contract: in Classic it must beat the defence's
 * total, in Contrée it must reach the bid.
 */
public final class RoundScoring {

    private static final String NORTH_SOUTH = "North–South";
    private static final String EAST_WEST = "East–West";

    private RoundScoring() {
    }

    /** A round's totals per team; the announcements are those that score, so one side is 0. */
    public record Totals(GameVariant variant, boolean northSouthDeclares, int contractValue, boolean coinched,
                         int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                         int eastWestDixDeDer, int northSouthBelote, int eastWestBelote, int northSouthTricks,
                         int northSouthAnnouncements, int eastWestAnnouncements) {
    }

    /**
     * A failed contract gives the defence 162 and every announcement that scored, and leaves the taker its Belote. A
     * team taking every trick scores 250, plus the bid in Contrée when it is the taker, and its own announcements;
     * a capoted taker fails. Belote always stays with its team, and a coinche doubles both scores.
     */
    public static GameBoard.RoundResult score(Totals totals, List<GameBoard.Declaration> declarations) {
        int northSouthTotal = totals.northSouthCardPoints() + totals.northSouthDixDeDer() + totals.northSouthBelote()
                + totals.northSouthAnnouncements();
        int eastWestTotal = totals.eastWestCardPoints() + totals.eastWestDixDeDer() + totals.eastWestBelote()
                + totals.eastWestAnnouncements();
        boolean northSouthDeclares = totals.northSouthDeclares();
        int takerTotal = northSouthDeclares ? northSouthTotal : eastWestTotal;
        int defenceTotal = northSouthDeclares ? eastWestTotal : northSouthTotal;
        String capotTeam = totals.northSouthTricks() == 8 ? NORTH_SOUTH : totals.northSouthTricks() == 0 ? EAST_WEST : "";
        String declaringTeam = northSouthDeclares ? NORTH_SOUTH : EAST_WEST;
        boolean contractMade = capotTeam.isEmpty()
                ? totals.variant() == GameVariant.CONTREE ? takerTotal >= totals.contractValue() : takerTotal > defenceTotal
                : capotTeam.equals(declaringTeam);

        int northSouthAwarded;
        int eastWestAwarded;
        if (!capotTeam.isEmpty()) {
            boolean northSouthCapot = capotTeam.equals(NORTH_SOUTH);
            int capotScore = 250 + (totals.variant() == GameVariant.CONTREE && capotTeam.equals(declaringTeam)
                    ? totals.contractValue() : 0);
            northSouthAwarded = northSouthCapot
                    ? capotScore + totals.northSouthAnnouncements() + totals.northSouthBelote()
                    : totals.northSouthBelote();
            eastWestAwarded = northSouthCapot
                    ? totals.eastWestBelote()
                    : capotScore + totals.eastWestAnnouncements() + totals.eastWestBelote();
        } else if (contractMade) {
            northSouthAwarded = northSouthTotal;
            eastWestAwarded = eastWestTotal;
        } else {
            int defence = 162 + totals.northSouthAnnouncements() + totals.eastWestAnnouncements();
            northSouthAwarded = northSouthDeclares ? totals.northSouthBelote() : defence + totals.northSouthBelote();
            eastWestAwarded = northSouthDeclares ? defence + totals.eastWestBelote() : totals.eastWestBelote();
        }
        if (totals.coinched()) {
            northSouthAwarded *= 2;
            eastWestAwarded *= 2;
        }
        return new GameBoard.RoundResult(totals.northSouthCardPoints(), totals.eastWestCardPoints(),
                totals.northSouthDixDeDer(), totals.eastWestDixDeDer(), totals.northSouthBelote(),
                totals.eastWestBelote(), contractMade, northSouthAwarded, eastWestAwarded, capotTeam,
                totals.northSouthAnnouncements(), totals.eastWestAnnouncements(), declarations);
    }
}
