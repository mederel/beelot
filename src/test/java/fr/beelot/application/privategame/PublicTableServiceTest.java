package fr.beelot.application.privategame;

import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTable;
import fr.beelot.game.PrivateTableConflictException;
import fr.beelot.game.PrivateTableStatus;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicTableServiceTest {

    private final PrivateTableService service = serviceWithBotFillWait(Duration.ofSeconds(60));

    private static PrivateTableService serviceWithBotFillWait(Duration wait) {
        return new PrivateTableService(Duration.ofMinutes(2), 2000, Duration.ofHours(2), wait);
    }

    @Test
    void openPublicCreatesAWaitingPublicTable() {
        Instant before = Instant.now();
        PrivateTable table = service.openPublic("Ana", GameVariant.CLASSIC).table();

        assertTrue(table.publicTable());
        assertNull(table.invitationCode());
        assertFalse(table.botFillAt().isBefore(before.plusSeconds(59)));
        assertFalse(table.botFillAt().isAfter(Instant.now().plusSeconds(61)));
        assertEquals(List.of(table), service.openPublicTables(GameVariant.CLASSIC));
        assertTrue(service.openPublicTables(GameVariant.CONTREE).isEmpty());
    }

    @Test
    void fourthPublicJoinBeginsTheMatch() {
        UUID tableId = service.openPublic("Ana", GameVariant.CLASSIC).table().id();
        service.joinPublic(tableId, "Benoit");
        service.joinPublic(tableId, "Chloe");
        PrivateTableService.PrivateTableAccess fourth = service.joinPublic(tableId, "David");

        assertEquals(PrivateTableStatus.IN_PROGRESS, fourth.table().status());
        assertEquals(5, service.bidding(tableId, fourth.token()).hand().size());
        assertTrue(service.openPublicTables(GameVariant.CLASSIC).isEmpty());
    }

    @Test
    void joinPublicRejectsPrivateTables() {
        UUID privateTableId = service.create("Ana").table().id();

        assertThrows(PrivateTableConflictException.class, () -> service.joinPublic(privateTableId, "Benoit"));
    }

    @Test
    void botFillBeginsTheMatch() {
        PrivateTableService.PrivateTableAccess owner = service.openPublic("Ana", GameVariant.CLASSIC);
        service.joinPublic(owner.table().id(), "Benoit");

        service.fillPublicTablesWithBots(Instant.now().plusSeconds(61));

        assertEquals(PrivateTableStatus.IN_PROGRESS, owner.table().status());
        assertEquals(4, owner.table().seats().size());
        assertEquals(5, service.bidding(owner.table().id(), owner.token()).hand().size());
    }

    @Test
    void fillAfterAutoStartDoesNothing() {
        PrivateTableService.PrivateTableAccess owner = service.openPublic("Ana", GameVariant.CLASSIC);
        UUID tableId = owner.table().id();
        service.joinPublic(tableId, "Benoit");
        service.joinPublic(tableId, "Chloe");
        service.joinPublic(tableId, "David");
        List<GameCard> hand = service.bidding(tableId, owner.token()).hand();

        service.fillPublicTablesWithBots(Instant.now().plusSeconds(61));

        assertEquals(hand, service.bidding(tableId, owner.token()).hand());
    }

    @Test
    void getTriggersBotFill() {
        PrivateTableService immediate = serviceWithBotFillWait(Duration.ZERO);
        UUID tableId = immediate.openPublic("Ana", GameVariant.CLASSIC).table().id();

        assertEquals(PrivateTableStatus.IN_PROGRESS, immediate.get(tableId).status());
    }

    @Test
    void ownerLeavingThenBotFillStillPlays() {
        PrivateTableService.PrivateTableAccess owner = service.openPublic("Ana", GameVariant.CLASSIC);
        UUID tableId = owner.table().id();
        PrivateTableService.PrivateTableAccess joiner = service.joinPublic(tableId, "Benoit");

        Optional<PrivateTable> remaining = service.leave(tableId, owner.token());

        assertEquals(1, remaining.orElseThrow().seats().size());
        service.fillPublicTablesWithBots(Instant.now().plusSeconds(61));
        assertEquals(5, service.bidding(tableId, joiner.token()).hand().size());
        assertThrows(PrivateTableConflictException.class, () -> service.bidding(tableId, owner.token()));
    }

    @Test
    void lastLeaveRemovesTheTable() {
        PrivateTableService.PrivateTableAccess owner = service.openPublic("Ana", GameVariant.CLASSIC);
        UUID tableId = owner.table().id();

        assertEquals(Optional.empty(), service.leave(tableId, owner.token()));
        assertEquals(0, service.tableCount());
        assertThrows(PrivateTableConflictException.class, () -> service.get(tableId));
    }

    @Test
    void leaveAfterStartFails() {
        PrivateTableService.PrivateTableAccess owner = service.openPublic("Ana", GameVariant.CLASSIC);
        UUID tableId = owner.table().id();
        service.joinPublic(tableId, "Benoit");
        service.joinPublic(tableId, "Chloe");
        service.joinPublic(tableId, "David");

        assertThrows(PrivateTableConflictException.class, () -> service.leave(tableId, owner.token()));
    }
}
