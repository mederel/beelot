package com.beelot.application.privategame;

import com.beelot.game.BiddingState;
import com.beelot.game.ConnectionState;
import com.beelot.game.GameBoard;
import com.beelot.game.GameCard;
import com.beelot.game.PrivateTable;
import com.beelot.game.PrivateTableConflictException;
import com.beelot.game.PrivateTableSeat;
import com.beelot.game.PrivateTableStatus;
import com.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

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

    @Test
    void onlyOwnerCanSetTheTurnTimerBeforeTheGameStarts() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess guest = service.join(owner.table().invitationCode(), "Benoit");

        assertEquals(30, service.setTurnTimer(owner.table().id(), owner.token(), 30).turnTimerSeconds());
        assertThrows(PrivateTableConflictException.class,
                () -> service.setTurnTimer(owner.table().id(), guest.token(), 60));
    }

    @Test
    void startedContreeTableSharesAnEightCardAuctionBetweenPlayers() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        PrivateTableService.PrivateTableAccess second = service.join(owner.table().invitationCode(), "Benoit");
        PrivateTableService.PrivateTableAccess third = service.join(owner.table().invitationCode(), "Chloe");
        PrivateTableService.PrivateTableAccess fourth = service.join(owner.table().invitationCode(), "David");
        for (var access : java.util.List.of(owner, second, third, fourth)) {
            service.ready(owner.table().id(), access.token(), true);
        }
        service.start(owner.table().id(), owner.token());

        assertEquals(8, service.bidding(owner.table().id(), owner.token()).hand().size());
        service.bid(owner.table().id(), owner.token(), 80, com.beelot.game.GameCard.Suit.HEARTS);
        assertEquals(80, service.bidding(owner.table().id(), second.token()).highestBid());
        assertEquals(true, service.bidding(owner.table().id(), second.token()).coincheAllowed());
    }

    @Test
    void startingAnActiveTableCannotReplaceItsAuction() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        PrivateTableService.PrivateTableAccess second = service.join(owner.table().invitationCode(), "Benoit");
        PrivateTableService.PrivateTableAccess third = service.join(owner.table().invitationCode(), "Chloe");
        PrivateTableService.PrivateTableAccess fourth = service.join(owner.table().invitationCode(), "David");
        for (var access : java.util.List.of(owner, second, third, fourth)) {
            service.ready(owner.table().id(), access.token(), true);
        }
        service.start(owner.table().id(), owner.token());
        service.bid(owner.table().id(), owner.token(), 100, com.beelot.game.GameCard.Suit.SPADES);

        assertThrows(PrivateTableConflictException.class,
                () -> service.start(owner.table().id(), owner.token()));
        assertEquals(100, service.bidding(owner.table().id(), second.token()).highestBid());
    }

    @Test
    void ownerCanStartWithBotsFillingAnyNumberOfEmptySeats() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess second = service.join(owner.table().invitationCode(), "Benoit");
        service.ready(owner.table().id(), owner.token(), true);
        service.ready(owner.table().id(), second.token(), true);

        PrivateTable table = service.startWithBots(owner.table().id(), owner.token());

        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
        assertEquals(4, table.seats().size());
        List<PrivateTableSeat> botSeats = table.seats().stream()
                .filter(seat -> seat.connectionState() == ConnectionState.AI_TAKEOVER).toList();
        assertEquals(2, botSeats.size());
        assertTrue(botSeats.stream().allMatch(PrivateTableSeat::ready));
    }

    @Test
    void nonOwnerCannotStartWithBots() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess guest = service.join(owner.table().invitationCode(), "Benoit");
        service.ready(owner.table().id(), owner.token(), true);
        service.ready(owner.table().id(), guest.token(), true);

        assertThrows(PrivateTableConflictException.class,
                () -> service.startWithBots(owner.table().id(), guest.token()));
    }

    @Test
    void startWithBotsRequiresEverySeatedPlayerToBeReady() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        service.join(owner.table().invitationCode(), "Benoit");
        service.ready(owner.table().id(), owner.token(), true);

        assertThrows(PrivateTableConflictException.class,
                () -> service.startWithBots(owner.table().id(), owner.token()));
    }

    @Test
    void startWithBotsRejectsAnAlreadyStartedTable() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        service.ready(owner.table().id(), owner.token(), true);
        service.startWithBots(owner.table().id(), owner.token());

        assertThrows(PrivateTableConflictException.class,
                () -> service.startWithBots(owner.table().id(), owner.token()));
    }

    @Test
    void classicTableWithBotsAlwaysReturnsControlToTheOwnerDuringTheAuction() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        service.ready(owner.table().id(), owner.token(), true);
        service.startWithBots(owner.table().id(), owner.token());

        BiddingState.BiddingView round1 = service.bidding(owner.table().id(), owner.token());
        assertEquals(1, round1.round());
        assertTrue(round1.playerTurn(), "the owner is the only human, so it must always be their turn");

        BiddingState.BiddingView round2 = service.pass(owner.table().id(), owner.token());
        assertEquals(2, round2.round(), "the three bots always pass, forcing round two");
        assertTrue(round2.playerTurn(), "bots never choose trump, so control must return to the owner");

        GameCard.Suit trump = round2.upturnedCard().suit() == GameCard.Suit.HEARTS
                ? GameCard.Suit.SPADES : GameCard.Suit.HEARTS;
        service.chooseTrump(owner.table().id(), owner.token(), trump);

        GameBoard.GameBoardView board = service.board(owner.table().id(), owner.token());
        assertEquals(board.currentPlayerIndex(), board.activePlayerIndex(), "the owner leads the first trick");
    }

    @Test
    void botsAutomaticallyPlayAFullContreeRoundAroundTheHuman() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        service.ready(owner.table().id(), owner.token(), true);
        service.startWithBots(owner.table().id(), owner.token());

        service.bid(owner.table().id(), owner.token(), 80, GameCard.Suit.HEARTS);
        GameBoard.GameBoardView board = service.board(owner.table().id(), owner.token());

        int guard = 0;
        while (board.roundResult() == null) {
            if (guard++ > 40) fail("The round did not complete after 40 plays; a bot turn may be stuck.");
            if (board.reviewingCompletedTrick()) {
                board = service.continueAfterTrick(owner.table().id(), owner.token());
                continue;
            }
            assertEquals(board.currentPlayerIndex(), board.activePlayerIndex(),
                    "control must be back with the owner whenever it isn't a bot's turn");
            GameCard card = board.legalCards().getFirst();
            board = service.play(owner.table().id(), owner.token(), card);
        }
        assertEquals(8, board.completedTricks());
    }
}
