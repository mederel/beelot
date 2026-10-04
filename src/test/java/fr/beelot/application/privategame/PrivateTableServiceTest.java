package fr.beelot.application.privategame;

import fr.beelot.game.BiddingState;
import fr.beelot.game.ConnectionState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.PrivateTable;
import fr.beelot.game.PrivateTableConflictException;
import fr.beelot.game.PrivateTableSeat;
import fr.beelot.game.PrivateTableStatus;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
    void reconnectRestoresTheSameSeatBeforeTimeoutAndRejectsItAfterBotTakeover() {
        PrivateTableService.PrivateTableAccess reconnectingOwner = service.create("Claire");
        service.disconnect(reconnectingOwner.table().id(), reconnectingOwner.token());
        assertEquals(ConnectionState.CONNECTED,
                service.reconnect(reconnectingOwner.table().id(), reconnectingOwner.token()).table().seats().getFirst().connectionState());

        PrivateTableService timedService = new PrivateTableService(java.time.Duration.ZERO);
        PrivateTableService.PrivateTableAccess owner = timedService.create("Ana");

        timedService.disconnect(owner.table().id(), owner.token());
        assertEquals(ConnectionState.BOT_TAKEOVER,
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
        service.bid(owner.table().id(), owner.token(), 80, GameCard.Suit.HEARTS);
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
        service.bid(owner.table().id(), owner.token(), 100, GameCard.Suit.SPADES);

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
                .filter(seat -> seat.connectionState() == ConnectionState.BOT_TAKEOVER).toList();
        assertEquals(2, botSeats.size());
        assertTrue(botSeats.stream().allMatch(PrivateTableSeat::ready));
    }

    @Test
    void playersChooseTheirSeatsAndBotsTakeTheRemainingOnes() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess partner = service.join(owner.table().invitationCode(), "Benoit");
        service.chooseSeat(owner.table().id(), partner.token(), 2);
        service.ready(owner.table().id(), owner.token(), true);
        service.ready(owner.table().id(), partner.token(), true);

        PrivateTable table = service.startWithBots(owner.table().id(), owner.token());

        List<PrivateTableSeat> seats = table.seats();
        assertEquals("Ana", seats.get(0).name());
        assertEquals(ConnectionState.BOT_TAKEOVER, seats.get(1).connectionState());
        assertEquals("Benoit", seats.get(2).name());
        assertEquals(ConnectionState.BOT_TAKEOVER, seats.get(3).connectionState());
        List<String> players = service.bidding(owner.table().id(), owner.token()).calls().stream()
                .map(BiddingState.PlayerCall::playerName).toList();
        assertEquals(List.of("Ana", seats.get(1).name(), "Benoit", seats.get(3).name()), players);
    }

    @Test
    void aPlayerCannotTakeAnOccupiedSeat() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess guest = service.join(owner.table().invitationCode(), "Benoit");

        assertThrows(PrivateTableConflictException.class,
                () -> service.chooseSeat(owner.table().id(), guest.token(), 0));
        assertThrows(PrivateTableConflictException.class,
                () -> service.chooseSeat(owner.table().id(), guest.token(), 4));
    }

    @Test
    void aJoiningPlayerTakesTheFirstEmptySeat() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        PrivateTableService.PrivateTableAccess guest = service.join(owner.table().invitationCode(), "Benoit");
        service.chooseSeat(owner.table().id(), guest.token(), 3);

        PrivateTableService.PrivateTableAccess third = service.join(owner.table().invitationCode(), "Chloe");

        PrivateTable table = third.table();
        assertEquals(1, table.positionOf(third.playerId()));
        assertEquals(3, table.positionOf(guest.playerId()));
        assertEquals(List.of("Ana", "Chloe", "Benoit"), table.seats().stream().map(PrivateTableSeat::name).toList());
    }

    @Test
    void seatsCannotChangeOnceTheGameHasStarted() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana");
        service.ready(owner.table().id(), owner.token(), true);
        service.startWithBots(owner.table().id(), owner.token());

        assertThrows(PrivateTableConflictException.class,
                () -> service.chooseSeat(owner.table().id(), owner.token(), 1));
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

        finishAuction(owner.table().id(), owner);
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

    @Test
    void aCompletedTrickIsCollectedOnceEveryoneHadTimeToSeeIt() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        java.util.UUID tableId = owner.table().id();
        service.ready(tableId, owner.token(), true);
        service.startWithBots(tableId, owner.token());
        finishAuction(tableId, owner);

        GameBoard.GameBoardView board = service.board(tableId, owner.token());
        while (!board.reviewingCompletedTrick()) {
            board = service.play(tableId, owner.token(), board.legalCards().getFirst());
        }

        java.time.Instant seen = java.time.Instant.now();
        assertTrue(service.board(tableId, owner.token(), seen).reviewingCompletedTrick());
        assertTrue(service.board(tableId, owner.token(), seen.plusMillis(3_900)).reviewingCompletedTrick(),
                "the trick stays on the table during the review time");

        GameBoard.GameBoardView collected = service.board(tableId, owner.token(), seen.plusSeconds(4));
        assertFalse(collected.reviewingCompletedTrick());
        assertEquals(1, collected.completedTricks());
        assertEquals(collected.currentPlayerIndex(), collected.activePlayerIndex(),
                "bots play up to the owner's turn once the trick is collected");
    }

    @Test
    void playersCanDealSeveralRoundsAndTheMatchScoreAccumulates() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        java.util.UUID tableId = owner.table().id();
        service.ready(tableId, owner.token(), true);
        service.startWithBots(tableId, owner.token());

        finishAuction(tableId, owner);
        assertThrows(PrivateTableConflictException.class, () -> service.nextRound(tableId, owner.token()),
                "the next round cannot be dealt while the current one is still being played");

        int dealer = service.bidding(tableId, owner.token()).dealerIndex();
        int expectedTotal = playRound(tableId, owner);
        for (int round = 2; round <= 3; round++) {
            BiddingState.BiddingView next = service.nextRound(tableId, owner.token());
            assertEquals((dealer + round - 1) % 4, next.dealerIndex(), "the deal passes to the left each round");
            assertEquals(8, next.hand().size());
            assertEquals(next.dealerIndex(), service.nextRound(tableId, owner.token()).dealerIndex(),
                    "a second click on the same finished round must not deal twice");
            finishAuction(tableId, owner);
            expectedTotal += playRound(tableId, owner);
        }

        PrivateTableService.MatchStatus match = service.matchStatus(tableId, owner.token());
        assertEquals(expectedTotal, match.northSouth() + match.eastWest());
    }

    @Test
    void theMatchEndsWhenATeamReachesOneThousandPointsAndARematchStartsAfresh() {
        PrivateTableService.PrivateTableAccess owner = service.create("Ana", GameVariant.CONTREE);
        java.util.UUID tableId = owner.table().id();
        service.ready(tableId, owner.token(), true);
        service.startWithBots(tableId, owner.token());

        finishAuction(tableId, owner);
        playRound(tableId, owner);
        for (int round = 2; !service.matchStatus(tableId, owner.token()).complete(); round++) {
            if (round > 20) fail("The match did not end after 20 rounds.");
            service.nextRound(tableId, owner.token());
            finishAuction(tableId, owner);
            playRound(tableId, owner);
        }

        PrivateTableService.MatchStatus match = service.matchStatus(tableId, owner.token());
        assertTrue(Math.max(match.northSouth(), match.eastWest()) >= 1_000);
        assertEquals(match.northSouth() > match.eastWest() ? "North–South" : "East–West", match.winner());
        assertThrows(PrivateTableConflictException.class, () -> service.nextRound(tableId, owner.token()),
                "no round is dealt once the match is won");

        service.rematch(tableId, owner.token());
        PrivateTableService.MatchStatus rematch = service.matchStatus(tableId, owner.token());
        assertEquals(0, rematch.northSouth() + rematch.eastWest());
        assertFalse(rematch.complete());
    }

    private void finishAuction(java.util.UUID tableId, PrivateTableService.PrivateTableAccess owner) {
        BiddingState.BiddingView bidding = service.bidding(tableId, owner.token());
        int guard = 0;
        while (!bidding.complete()) {
            if (guard++ > 20) fail("The auction did not complete.");
            bidding = bidding.highestBid() < 160
                    ? service.bid(tableId, owner.token(), Math.max(80, bidding.highestBid() + 10), GameCard.Suit.HEARTS)
                    : service.pass(tableId, owner.token());
        }
    }

    private int playRound(java.util.UUID tableId, PrivateTableService.PrivateTableAccess owner) {
        GameBoard.GameBoardView board = service.board(tableId, owner.token());
        int guard = 0;
        while (board.roundResult() == null) {
            if (guard++ > 40) fail("The round did not complete after 40 plays.");
            board = board.reviewingCompletedTrick()
                    ? service.continueAfterTrick(tableId, owner.token())
                    : service.play(tableId, owner.token(), board.legalCards().getFirst());
        }
        return board.roundResult().northSouthAwarded() + board.roundResult().eastWestAwarded();
    }
}
