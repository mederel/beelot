package fr.beelot.application.bot;

import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
