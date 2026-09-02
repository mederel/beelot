package com.beelot.application.privategame;

import com.beelot.game.PrivateTableConflictException;
import com.beelot.game.PrivateTableStatus;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PrivateTableServiceTest {

    private final PrivateTableService service = new PrivateTableService();

    @Test
    void ownerCanStartOnlyWhenFourPlayersAreReady() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess second = service.join(owner.table().invitationCode(), "Benoit");
        PrivateTableService.PrivateTableAccess third = service.join(owner.table().invitationCode(), "Chloe");
        PrivateTableService.PrivateTableAccess fourth = service.join(owner.table().invitationCode(), "David");

        assertEquals(4, owner.table().seats().size());
        assertThrows(PrivateTableConflictException.class,
                () -> service.start(owner.table().id(), owner.token()));

        service.ready(owner.table().id(), owner.token(), true);
        service.ready(owner.table().id(), second.token(), true);
        service.ready(owner.table().id(), third.token(), true);
        service.ready(owner.table().id(), fourth.token(), true);

        assertEquals(PrivateTableStatus.IN_PROGRESS, service.start(owner.table().id(), owner.token()).status());
    }

    @Test
    void nonOwnerCannotStartTheTable() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess guest = service.join(owner.table().invitationCode(), "Benoit");

        assertThrows(PrivateTableConflictException.class,
                () -> service.start(owner.table().id(), guest.token()));
    }

    @Test
    void reconnectRestoresTheSameSeatBeforeTimeoutAndRejectsItAfterAiTakeover() {
        PrivateTableService.PrivateTableAccess reconnectingOwner = service.create("Claire");
        service.disconnect(reconnectingOwner.table().id(), reconnectingOwner.token());
        assertEquals(com.beelot.game.ConnectionState.CONNECTED,
                service.reconnect(reconnectingOwner.table().id(), reconnectingOwner.token()).table().seats().getFirst().connectionState());

        PrivateTableService timedService = new PrivateTableService(java.time.Duration.ZERO);
        PrivateTableService.PrivateTableAccess owner = timedService.create("Ana");

        timedService.disconnect(owner.table().id(), owner.token());
        assertEquals(com.beelot.game.ConnectionState.AI_TAKEOVER,
                timedService.get(owner.table().id()).seats().getFirst().connectionState());
        assertThrows(PrivateTableConflictException.class,
                () -> timedService.reconnect(owner.table().id(), owner.token()));
    }
}
