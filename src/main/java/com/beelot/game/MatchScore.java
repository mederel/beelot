package com.beelot.game;

public final class MatchScore {

    private int northSouth;
    private int eastWest;
    private boolean complete;

    public void record(GameBoard.RoundResult round) {
        if (complete) return;
        northSouth += round.northSouthAwarded();
        eastWest += round.eastWestAwarded();
        complete = northSouth >= 1_000 || eastWest >= 1_000;
    }

    public int northSouth() { return northSouth; }
    public int eastWest() { return eastWest; }
    public boolean complete() { return complete; }
    public String winner() {
        if (!complete) return "";
        return northSouth >= eastWest ? "North–South" : "East–West";
    }
}
