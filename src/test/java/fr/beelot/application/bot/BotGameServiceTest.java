package fr.beelot.application.bot;

import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTableConflictException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.fail;

class BotGameServiceTest {

    @Test
    void playerReceivesFiveCardsBeforeBiddingAndEightAfterChoosingTrump() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.RELAXED);
        var playerId = game.seats().stream()
                .filter(seat -> seat.type().name().equals("HUMAN"))
                .findFirst()
                .orElseThrow()
                .playerId();

        var bidding = service.bidding(game.id());
        assertEquals(5, bidding.hand().size());

        var board = service.chooseTrump(game.id(), bidding.upturnedCard().suit()).viewFor(playerId);

        assertEquals(8, board.hand().size());
        assertEquals(4, board.seats().size());
        assertEquals(32, board.seats().stream().mapToInt(seat -> seat.cardCount()).sum());
    }

    @Test
    void activePlayerCanPlayOnlyFromTheServerProvidedLegalSet() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.RELAXED);
        var bidding = service.bidding(game.id());
        service.chooseTrump(game.id(), bidding.upturnedCard().suit());
        var board = service.board(game.id()).viewFor(game.seats().getFirst().playerId());

        assertEquals(8, board.legalCards().size());
        service.play(game.id(), board.legalCards().getFirst());

        var afterPlay = service.board(game.id()).viewFor(game.seats().getFirst().playerId());
        assertEquals(7, afterPlay.hand().size());
        assertEquals(4, afterPlay.currentTrick().size());
        assertEquals(1, afterPlay.completedTricks());
        assertEquals(true, afterPlay.reviewingCompletedTrick());
        assertEquals(0, afterPlay.legalCards().size());
    }

    @Test
    void lastTrickIsPlayedForTheHumanAndTheRoundIsRecorded() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.CHALLENGING, GameVariant.CONTREE);
        service.bid(game.id(), 160, GameCard.Suit.SPADES);
        var humanId = game.seats().getFirst().playerId();
        var board = service.board(game.id()).viewFor(humanId);
        while (board.roundResult() == null) {
            if (board.reviewingCompletedTrick()) {
                service.continueAfterTrick(game.id());
            } else {
                assertEquals(false, board.hand().size() == 1, "The human never plays the last card.");
                service.play(game.id(), board.legalCards().getFirst());
            }
            board = service.board(game.id()).viewFor(humanId);
        }

        assertEquals(8, board.completedTricks());
        var match = service.matchStatus(game.id());
        assertEquals(board.roundResult().northSouthAwarded() + board.roundResult().eastWestAwarded(),
                match.northSouth() + match.eastWest());
    }

    @Test
    void teamScoresAccumulateRoundAfterRound() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.CHALLENGING, GameVariant.CONTREE);
        var humanId = game.seats().getFirst().playerId();

        int expectedNorthSouth = 0;
        int expectedEastWest = 0;
        for (int round = 1; round <= 3; round++) {
            if (round > 1) service.nextRound(game.id());
            var result = playRound(service, game.id(), humanId);
            expectedNorthSouth += result.northSouthAwarded();
            expectedEastWest += result.eastWestAwarded();

            var match = service.matchStatus(game.id());
            assertEquals(expectedNorthSouth, match.northSouth(), "North–South total after round " + round);
            assertEquals(expectedEastWest, match.eastWest(), "East–West total after round " + round);
        }
    }

    @Test
    void theMatchEndsWhenATeamReachesOneThousandPointsAndARematchStartsAfresh() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.CHALLENGING, GameVariant.CONTREE);
        var humanId = game.seats().getFirst().playerId();

        playRound(service, game.id(), humanId);
        for (int round = 2; !service.matchStatus(game.id()).complete(); round++) {
            if (round > 20) fail("The match did not end after 20 rounds.");
            service.nextRound(game.id());
            playRound(service, game.id(), humanId);
        }

        var match = service.matchStatus(game.id());
        int winningScore = Math.max(match.northSouth(), match.eastWest());
        assertEquals(true, winningScore >= 1_000);
        assertEquals(match.northSouth() > match.eastWest() ? "North–South" : "East–West", match.winner());
        assertThrows(PrivateTableConflictException.class, () -> service.nextRound(game.id()),
                "no round is dealt once the match is won");

        service.rematch(game.id());
        var rematch = service.matchStatus(game.id());
        assertEquals(0, rematch.northSouth() + rematch.eastWest());
        assertEquals(false, rematch.complete());
    }

    private static fr.beelot.game.GameBoard.RoundResult playRound(BotGameService service, java.util.UUID gameId,
                                                                  java.util.UUID humanId) {
        var bidding = service.bidding(gameId);
        for (int guard = 0; !bidding.complete(); guard++) {
            if (guard > 20) fail("The auction did not complete.");
            if (bidding.highestBid() < 160) {
                bidding = service.bid(gameId, 160, GameCard.Suit.SPADES);
            } else if (bidding.coincheAllowed()) {
                service.coinche(gameId);
                bidding = service.bidding(gameId);
            } else {
                bidding = service.pass(gameId);
            }
        }
        var board = service.board(gameId).viewFor(humanId);
        for (int guard = 0; board.roundResult() == null; guard++) {
            if (guard > 40) fail("The round did not finish.");
            if (board.reviewingCompletedTrick()) service.continueAfterTrick(gameId);
            else service.play(gameId, board.legalCards().getFirst());
            board = service.board(gameId).viewFor(humanId);
        }
        return board.roundResult();
    }

    @Test
    void contreeBidStartsAContractBoardAfterBotPlayersPass() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.CHALLENGING, GameVariant.CONTREE);

        assertEquals(8, service.bidding(game.id()).hand().size());
        assertEquals(true, service.bid(game.id(), 160, GameCard.Suit.SPADES).complete());
        var board = service.board(game.id()).viewFor(game.seats().getFirst().playerId());

        assertEquals(GameVariant.CONTREE, board.variant());
        assertEquals(160, board.contractValue());
        assertEquals("Spades", board.trump());
    }

    @Test
    void auctionComesBackToTheHumanWhenTheBotPartnerSupportsTheirBid() {
        BotGameService service = new BotGameService();
        for (int attempt = 0; attempt < 200; attempt++) {
            var game = service.create(BotDifficulty.RELAXED, GameVariant.CONTREE);
            var bidding = service.bid(game.id(), 80, GameCard.Suit.SPADES);
            if (bidding.highestBid() == 80) continue;

            assertEquals(game.seats().get(2).name(), bidding.highestBidder());
            assertEquals("SPADES", bidding.highestBidSuit().name());
            assertEquals(false, bidding.complete());
            assertEquals(true, bidding.playerTurn());
            return;
        }
        fail("The bot partner never supported the human's bid.");
    }

    @Test
    void dealerAndFirstBidderRotateEveryRoundAndBotsBidBeforeTheHuman() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.RELAXED);
        assertEquals(3, service.bidding(game.id()).dealerIndex());
        assertEquals("You", service.bidding(game.id()).activePlayer());

        var bidding = service.bidding(game.id());
        service.chooseTrump(game.id(), bidding.upturnedCard().suit());
        var next = service.nextRound(game.id());

        assertEquals(0, next.dealerIndex());
        assertEquals("You", next.activePlayer());
        assertEquals(true, next.playerTurn());
    }

    @Test
    void botsPlayFirstWhenTheyLeadTheTrick() {
        BotGameService service = new BotGameService();
        var game = service.create(BotDifficulty.RELAXED);
        var humanId = game.seats().getFirst().playerId();
        service.chooseTrump(game.id(), service.bidding(game.id()).upturnedCard().suit());
        service.nextRound(game.id());
        service.nextRound(game.id());
        // Dealer is now seat 1, so seat 2 (a bot) speaks first and the human is asked to bid after the bots pass.
        var bidding = service.bidding(game.id());
        assertEquals(1, bidding.dealerIndex());
        service.chooseTrump(game.id(), bidding.upturnedCard().suit());
        var board = service.board(game.id()).viewFor(humanId);

        assertEquals("You", board.activePlayer());
        assertEquals(2, board.currentTrick().size());
    }
}
