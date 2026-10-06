package fr.beelot.game;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Team scores added up over the rounds of a match. The first team to reach 1,000 points wins; when both teams pass
 * 1,000 in the same round, the higher score wins, and an exact tie is settled by playing another round. Each match
 * has its own id, and keeps the rounds recorded with their contracts.
 */
public final class MatchScore {

    static final int WINNING_SCORE = 1_000;

    private final UUID id = UUID.randomUUID();
    private final List<GameBoard.RoundSummary> rounds = new ArrayList<>();
    private int northSouth;
    private int eastWest;
    private boolean complete;

    /** Adds a finished round; returns true when this round ends the match, which happens once. */
    public synchronized boolean record(GameBoard.RoundSummary round) {
        if (complete) return false;
        rounds.add(round);
        record(round.result());
        return complete;
    }

    public synchronized void record(GameBoard.RoundResult round) {
        if (complete) return;
        northSouth += round.northSouthAwarded();
        eastWest += round.eastWestAwarded();
        complete = Math.max(northSouth, eastWest) >= WINNING_SCORE && northSouth != eastWest;
    }

    public UUID id() { return id; }
    public synchronized List<GameBoard.RoundSummary> rounds() { return List.copyOf(rounds); }
    public synchronized int northSouth() { return northSouth; }
    public synchronized int eastWest() { return eastWest; }
    public synchronized boolean complete() { return complete; }
    public synchronized String winner() {
        if (!complete) return "";
        return northSouth > eastWest ? "North–South" : "East–West";
    }
}
