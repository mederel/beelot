package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicTableTest {

    private static final Instant T0 = Instant.parse("2026-10-02T12:00:00Z");
    private static final Instant BOT_FILL_AT = T0.plusSeconds(60);

    private final UUID ownerId = UUID.randomUUID();
    private final PrivateTable table = PrivateTable.openPublic(UUID.randomUUID(), ownerId, "Ana", GameVariant.CLASSIC, BOT_FILL_AT);

    @Test
    void publicTableHasNoInvitationCode() {
        assertNull(table.invitationCode());
        assertTrue(table.publicTable());
        assertEquals(BOT_FILL_AT, table.botFillAt());
        assertEquals(PrivateTableStatus.WAITING_FOR_PLAYERS, table.status());
    }

    @Test
    void fourthJoinStartsAPublicTable() {
        table.join(UUID.randomUUID(), "Benoit");
        table.join(UUID.randomUUID(), "Chloe");
        assertEquals(PrivateTableStatus.WAITING_FOR_PLAYERS, table.status());

        table.join(UUID.randomUUID(), "David");

        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
        assertEquals(4, table.seats().size());
        assertTrue(table.seats().stream().allMatch(PrivateTableSeat::ready));
    }

    @Test
    void fourthJoinDoesNotStartAPrivateTable() {
        PrivateTable privateTable = new PrivateTable(UUID.randomUUID(), "ABC123", UUID.randomUUID(), "Ana");
        privateTable.join(UUID.randomUUID(), "Benoit");
        privateTable.join(UUID.randomUUID(), "Chloe");
        privateTable.join(UUID.randomUUID(), "David");

        assertEquals(PrivateTableStatus.WAITING_FOR_PLAYERS, privateTable.status());
        assertFalse(privateTable.publicTable());
        assertNull(privateTable.botFillAt());
    }

    @Test
    void leaveFreesTheSeatAndTransfersOwnership() {
        UUID joinerId = UUID.randomUUID();
        table.join(joinerId, "Benoit");

        table.leave(ownerId);

        assertEquals(1, table.seats().size());
        assertEquals(joinerId, table.ownerPlayerId());
        assertFalse(table.isEmpty());

        table.leave(joinerId);

        assertTrue(table.isEmpty());
    }

    @Test
    void leaveAfterStartFails() {
        table.join(UUID.randomUUID(), "Benoit");
        table.join(UUID.randomUUID(), "Chloe");
        table.join(UUID.randomUUID(), "David");

        assertThrows(PrivateTableConflictException.class, () -> table.leave(ownerId));
    }

    @Test
    void leaveUnknownPlayerFails() {
        assertThrows(PrivateTableConflictException.class, () -> table.leave(UUID.randomUUID()));
    }

    @Test
    void fillWithBotsWaitsForTheDeadline() {
        table.join(UUID.randomUUID(), "Benoit");

        assertFalse(table.fillWithBotsIfDue(T0.plusSeconds(59)));
        assertEquals(PrivateTableStatus.WAITING_FOR_PLAYERS, table.status());

        assertTrue(table.fillWithBotsIfDue(T0.plusSeconds(60)));

        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
        assertEquals(4, table.seats().size());
        assertEquals("Camille", table.seats().get(2).name());
        assertEquals("Luc", table.seats().get(3).name());
        assertEquals(ConnectionState.BOT_TAKEOVER, table.seats().get(2).connectionState());
        assertEquals(ConnectionState.BOT_TAKEOVER, table.seats().get(3).connectionState());
        assertTrue(table.seats().stream().allMatch(PrivateTableSeat::ready));
        assertFalse(table.fillWithBotsIfDue(T0.plusSeconds(61)));
    }

    @Test
    void anEmptiedTableIsClosed() {
        table.leave(ownerId);

        assertThrows(PrivateTableConflictException.class, () -> table.join(UUID.randomUUID(), "Benoit"));
        assertFalse(table.fillWithBotsIfDue(T0.plusSeconds(3600)));
        assertTrue(table.isEmpty());
    }

    @Test
    void fillWithBotsIgnoresPrivateAndStartedTables() {
        PrivateTable privateTable = new PrivateTable(UUID.randomUUID(), "ABC123", UUID.randomUUID(), "Ana");
        assertFalse(privateTable.fillWithBotsIfDue(T0.plusSeconds(3600)));

        table.join(UUID.randomUUID(), "Benoit");
        table.join(UUID.randomUUID(), "Chloe");
        table.join(UUID.randomUUID(), "David");

        assertFalse(table.fillWithBotsIfDue(T0.plusSeconds(3600)));
        assertEquals(4, table.seats().size());
    }
}
