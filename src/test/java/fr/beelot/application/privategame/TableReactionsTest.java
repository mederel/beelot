package fr.beelot.application.privategame;

import fr.beelot.game.PrivateTableConflictException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableReactionsTest {

    private final TableReactions reactions = new TableReactions();
    private final UUID table = UUID.randomUUID();
    private final UUID ana = UUID.randomUUID();
    private final Instant start = Instant.parse("2026-10-06T20:00:00Z");

    @Test
    void listsTheReactionsOfTheTableInTheOrderTheyWereSent() {
        reactions.send(table, ana, 0, TableReaction.WOW, start);
        reactions.send(table, UUID.randomUUID(), 3, TableReaction.OOPS, start.plusSeconds(1));
        reactions.send(UUID.randomUUID(), UUID.randomUUID(), 1, TableReaction.GOOD_GAME, start.plusSeconds(1));

        List<TableReactions.Reaction> recent = reactions.recent(table, start.plusSeconds(2));

        assertEquals(List.of(TableReaction.WOW, TableReaction.OOPS),
                recent.stream().map(TableReactions.Reaction::reaction).toList());
        assertEquals(List.of(0, 3), recent.stream().map(TableReactions.Reaction::position).toList());
        assertTrue(recent.get(0).sequence() < recent.get(1).sequence());
    }

    @Test
    void forgetsReactionsAfterThirtySeconds() {
        reactions.send(table, ana, 0, TableReaction.WOW, start);

        assertEquals(1, reactions.recent(table, start.plusSeconds(30)).size());
        assertEquals(0, reactions.recent(table, start.plusSeconds(31)).size());
    }

    @Test
    void aPlayerSendsAtMostThreeReactionsInTenSeconds() {
        for (int second = 0; second < 3; second++) {
            reactions.send(table, ana, 0, TableReaction.WOW, start.plusSeconds(second));
        }

        assertEquals("Slow down: wait a moment before reacting again.", assertThrows(
                PrivateTableConflictException.class,
                () -> reactions.send(table, ana, 0, TableReaction.WOW, start.plusSeconds(9))).getMessage());
        reactions.send(table, UUID.randomUUID(), 1, TableReaction.OOPS, start.plusSeconds(9));
        reactions.send(table, ana, 0, TableReaction.WOW, start.plusSeconds(10));
    }
}
