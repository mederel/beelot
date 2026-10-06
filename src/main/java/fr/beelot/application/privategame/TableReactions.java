package fr.beelot.application.privategame;

import fr.beelot.game.PrivateTableConflictException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The reactions recently sent at each table. A reaction is kept for 30 seconds, long enough for every player's
 * client to pick it up when it refreshes the table. A player may send at most 3 reactions in 10 seconds.
 */
final class TableReactions {

    static final Duration KEPT_FOR = Duration.ofSeconds(30);
    static final int BURST = 3;
    static final Duration BURST_WINDOW = Duration.ofSeconds(10);
    private static final int MAX_KEPT = 40;

    private final Map<UUID, Deque<Reaction>> byTable = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> sentByPlayer = new ConcurrentHashMap<>();
    private long sequence;

    /** A reaction sent from the seat at the given position; the sequence orders the reactions of all tables. */
    record Reaction(long sequence, int position, TableReaction reaction, Instant sentAt) {
    }

    synchronized Reaction send(UUID tableId, UUID playerId, int position, TableReaction reaction, Instant now) {
        if (reaction == null) throw new PrivateTableConflictException("Choose a reaction.");
        Deque<Instant> sent = sentByPlayer.computeIfAbsent(playerId, id -> new ArrayDeque<>());
        while (!sent.isEmpty() && !sent.peekFirst().isAfter(now.minus(BURST_WINDOW))) sent.removeFirst();
        if (sent.size() >= BURST) {
            throw new PrivateTableConflictException("Slow down: wait a moment before reacting again.");
        }
        sent.addLast(now);
        Deque<Reaction> reactions = byTable.computeIfAbsent(tableId, id -> new ArrayDeque<>());
        Reaction sentReaction = new Reaction(++sequence, position, reaction, now);
        reactions.addLast(sentReaction);
        prune(reactions, now);
        return sentReaction;
    }

    /** The reactions sent at the table in the last 30 seconds, oldest first. */
    synchronized List<Reaction> recent(UUID tableId, Instant now) {
        Deque<Reaction> reactions = byTable.get(tableId);
        if (reactions == null) return List.of();
        prune(reactions, now);
        return List.copyOf(reactions);
    }

    synchronized void forget(UUID tableId, Iterable<UUID> playerIds) {
        byTable.remove(tableId);
        playerIds.forEach(sentByPlayer::remove);
    }

    private static void prune(Deque<Reaction> reactions, Instant now) {
        while (!reactions.isEmpty() && (reactions.size() > MAX_KEPT
                || reactions.peekFirst().sentAt().isBefore(now.minus(KEPT_FOR)))) {
            reactions.removeFirst();
        }
    }
}
