package fr.beelot.game;

/**
 * Team scores added up over the rounds of a match. The first team to reach 1,000 points wins; when both teams pass
 * 1,000 in the same round, the higher score wins, and an exact tie is settled by playing another round.
 */
public final class MatchScore {

    static final int WINNING_SCORE = 1_000;

    private int northSouth;
    private int eastWest;
    private boolean complete;

    public void record(GameBoard.RoundResult round) {
        if (complete) return;
        northSouth += round.northSouthAwarded();
        eastWest += round.eastWestAwarded();
        complete = Math.max(northSouth, eastWest) >= WINNING_SCORE && northSouth != eastWest;
    }

    public int northSouth() { return northSouth; }
    public int eastWest() { return eastWest; }
    public boolean complete() { return complete; }
    public String winner() {
        if (!complete) return "";
        return northSouth > eastWest ? "North–South" : "East–West";
    }
}
