package fr.beelot.game;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Team scores added up over the rounds of a match. The first team to reach the match target (1,000 points unless
 * the players chose 500, 1,500 or 2,000, US-062) wins; when both teams reach it in the same round, the higher score
 * wins, and an exact tie is settled by playing another round. Each match has its own id, and keeps the rounds
 * recorded with their contracts.
 */
public final class MatchScore {

    public static final List<Integer> TARGETS = List.of(500, 1_000, 1_500, 2_000);
    static final int DEFAULT_TARGET = 1_000;

    private final UUID id = UUID.randomUUID();
    private final int target;
    private final List<GameBoard.RoundSummary> rounds = new ArrayList<>();
    private int northSouth;
    private int eastWest;
    private boolean complete;

    public MatchScore() {
        this(DEFAULT_TARGET);
    }

    public MatchScore(int target) {
        this.target = requireTarget(target);
    }

    /** Returns the target, or throws when it is not one of {@link #TARGETS}. */
    public static int requireTarget(int target) {
        if (!TARGETS.contains(target)) throw new InvalidMatchTargetException();
        return target;
    }

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
        complete = Math.max(northSouth, eastWest) >= target && northSouth != eastWest;
    }

    public UUID id() { return id; }
    public int target() { return target; }
    public synchronized List<GameBoard.RoundSummary> rounds() { return List.copyOf(rounds); }
    public synchronized int northSouth() { return northSouth; }
    public synchronized int eastWest() { return eastWest; }
    public synchronized boolean complete() { return complete; }
    public synchronized String winner() {
        if (!complete) return "";
        return northSouth > eastWest ? "North–South" : "East–West";
    }
}
