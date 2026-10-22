package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** The rules of a table friends gather at before the game: who may sit, move, start it and set its timer. */
class PrivateTableTest {

    private static final Instant T0 = Instant.parse("2026-10-17T12:00:00Z");

    private final UUID ownerId = UUID.randomUUID();
    private final PrivateTable table = new PrivateTable(UUID.randomUUID(), "ABC123", ownerId, "Ana");

    @Test
    void aFifthPlayerCannotJoinAFullTable() {
        seatThreeMore();

        assertEquals("This table is full.", refusal(() -> table.join(UUID.randomUUID(), "Eve")));
        assertEquals(4, table.seats().size());
    }

    @Test
    void nobodyJoinsOrLeavesOnceTheGameHasStarted() {
        table.setReady(ownerId, true);
        table.startWithBots(ownerId);

        assertEquals("This table has already started.", refusal(() -> table.join(UUID.randomUUID(), "Eve")));
        assertEquals("This table has already started.", refusal(() -> table.chooseSeat(ownerId, 1)));
        assertEquals("This table has already started.", refusal(() -> table.setReady(ownerId, false)));
    }

    @Test
    void theOwnerStartsOnlyWithFourReadyPlayers() {
        UUID[] others = seatThreeMore();
        table.setReady(ownerId, true);
        table.setReady(others[0], true);
        table.setReady(others[1], true);

        assertEquals("Only the table owner can start the game.", refusal(() -> table.start(others[0])));
        assertEquals("Four ready players are required to start the game.", refusal(() -> table.start(ownerId)));

        table.setReady(others[2], true);
        table.start(ownerId);
        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
        assertEquals("This table has already started.", refusal(() -> table.start(ownerId)));
    }

    @Test
    void aPlayerMovesOnlyToASeatThatExists() {
        assertEquals("That seat does not exist.", refusal(() -> table.chooseSeat(ownerId, -1)));
        assertEquals("That seat does not exist.", refusal(() -> table.chooseSeat(ownerId, 4)));

        table.chooseSeat(ownerId, 0);
        assertEquals(0, table.positionOf(ownerId));

        table.chooseSeat(ownerId, 2);
        assertEquals(2, table.positionOf(ownerId));
    }

    @Test
    void seatsAreAssignedAtPublicTables() {
        PrivateTable publicTable = PrivateTable.openPublic(UUID.randomUUID(), ownerId, "Ana", GameVariant.CLASSIC,
                T0.plusSeconds(60));

        assertEquals("Seats are assigned at public tables.", refusal(() -> publicTable.chooseSeat(ownerId, 2)));
    }

    @Test
    void onlyTheOwnerSetsTheTurnTimerToNone30Or60SecondsBeforeTheStart() {
        UUID guest = UUID.randomUUID();
        table.join(guest, "Ben");

        assertEquals("Only the table owner can change the turn timer.", refusal(() -> table.setTurnTimer(guest, 30)));
        assertEquals("Choose no timer, 30 seconds, or 60 seconds.", refusal(() -> table.setTurnTimer(ownerId, 45)));

        table.setTurnTimer(ownerId, 60);
        assertEquals(60, table.turnTimerSeconds());
        table.setTurnTimer(ownerId, 0);
        assertEquals(0, table.turnTimerSeconds());

        table.setReady(ownerId, true);
        table.setReady(guest, true);
        table.startWithBots(ownerId);
        assertEquals("The turn timer cannot change after the game starts.",
                refusal(() -> table.setTurnTimer(ownerId, 30)));
    }

    @Test
    void ownerSetsTheTargetBeforeTheStart() {
        assertEquals(1_000, table.target());

        table.setTarget(ownerId, 1_500);

        assertEquals(1_500, table.target());
        assertThrows(InvalidMatchTargetException.class, () -> table.setTarget(ownerId, 750));
    }

    @Test
    void onlyTheOwnerSetsTheTarget() {
        UUID guest = UUID.randomUUID();
        table.join(guest, "Ben");

        assertEquals("Only the table owner can change the match target.", refusal(() -> table.setTarget(guest, 500)));
    }

    @Test
    void targetIsFixedOnceStarted() {
        table.setReady(ownerId, true);
        table.startWithBots(ownerId);

        assertEquals("The match target cannot change after the game starts.",
                refusal(() -> table.setTarget(ownerId, 500)));
    }

    @Test
    void publicTablesStayAtOneThousandPoints() {
        PrivateTable publicTable = PrivateTable.openPublic(UUID.randomUUID(), ownerId, "Ana", GameVariant.CLASSIC,
                T0.plusSeconds(60));

        assertEquals("Public tables always play to 1,000 points.", refusal(() -> publicTable.setTarget(ownerId, 500)));
        assertEquals(1_000, publicTable.target());
    }

    @Test
    void aSeatABotHasTakenOverStaysWithTheBot() {
        UUID guest = UUID.randomUUID();
        table.join(guest, "Ben");
        table.handToBot(guest, "Luc");

        table.disconnect(guest, T0);

        assertEquals(ConnectionState.BOT_TAKEOVER, table.seats().get(1).connectionState());
        assertEquals("A bot has taken over this seat for the rest of the match.", refusal(() -> table.reconnect(guest)));
    }

    private UUID[] seatThreeMore() {
        UUID[] others = {UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()};
        table.join(others[0], "Ben");
        table.join(others[1], "Chloe");
        table.join(others[2], "David");
        return others;
    }

    private static String refusal(Runnable action) {
        return assertThrows(PrivateTableConflictException.class, action::run).getMessage();
    }
}
