package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BiddingStateTest {

    @Test
    void botsSeeWhetherTheRoundPlaysWithAnnouncements() {
        List<GameBoard.GamePlayer> players = List.of(new GameBoard.GamePlayer(UUID.randomUUID(), "North"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "East"), new GameBoard.GamePlayer(UUID.randomUUID(), "South"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "West"));
        UUID first = players.getFirst().playerId();

        assertTrue(new BiddingState(players, GameVariant.CONTREE, 0, new Random(1)).announcements(true)
                .auctionViewFor(first).announcements());
        assertFalse(new BiddingState(players, GameVariant.CONTREE, 0, new Random(1)).auctionViewFor(first)
                .announcements());
    }

    @Test
    void passingTwiceAroundTheTableRedealsTheCards() {
        UUID playerId = UUID.randomUUID();
        BiddingState bidding = new BiddingState(List.of(
                new GameBoard.GamePlayer(playerId, "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three")
        ));

        for (int turn = 0; turn < 4; turn++) {
            bidding.pass(bidding.activePlayerId());
        }
        assertEquals(2, bidding.viewFor(playerId).round());

        for (int turn = 0; turn < 4; turn++) {
            bidding.pass(bidding.activePlayerId());
        }

        assertEquals(1, bidding.viewFor(playerId).round());
        assertEquals(5, bidding.viewFor(playerId).hand().size());
        assertEquals("Everyone passed twice. The cards have been redealt.", bidding.viewFor(playerId).message());
    }

    @Test
    void theAuctionLogKeepsEveryCallInOrderUntilTheCardsAreRedealt() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));
        BiddingState bidding = new BiddingState(players, GameVariant.CLASSIC, 3);
        UUID viewer = players.get(0).playerId();
        UUID firstAuction = bidding.viewFor(viewer).auctionId();

        for (int turn = 0; turn < 5; turn++) {
            bidding.pass(bidding.activePlayerId());
        }

        BiddingState.BiddingView view = bidding.viewFor(viewer);
        assertEquals(firstAuction, view.auctionId());
        assertEquals(List.of("You", "One", "Two", "Three", "You"),
                view.auction().stream().map(BiddingState.AuctionCall::playerName).toList());
        assertEquals(List.of("Pass", "Pass", "Pass", "Pass", "Pass"),
                view.auction().stream().map(BiddingState.AuctionCall::call).toList());

        for (int turn = 0; turn < 3; turn++) {
            bidding.pass(bidding.activePlayerId());
        }

        assertNotEquals(firstAuction, bidding.viewFor(viewer).auctionId());
        assertEquals(List.of(), bidding.viewFor(viewer).auction());
    }

    @Test
    void playerToTheDealersLeftSpeaksFirstAndLeadsTheFirstTrick() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));
        BiddingState bidding = new BiddingState(players, GameVariant.CLASSIC, 1);

        assertEquals(1, bidding.dealerIndex());
        assertEquals("Two", bidding.viewFor(players.get(0).playerId()).activePlayer());

        UUID taker = bidding.activePlayerId();
        GameBoard board = bidding.chooseTrump(taker, bidding.viewFor(taker).upturnedCard().suit());
        assertEquals("Two", board.viewFor(players.get(0).playerId()).activePlayer());
    }

    @Test
    void redealingPassesTheDealToTheNextPlayer() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));
        BiddingState bidding = new BiddingState(players, GameVariant.CLASSIC, 3);

        for (int turn = 0; turn < 8; turn++) {
            bidding.pass(bidding.activePlayerId());
        }

        assertEquals(0, bidding.dealerIndex());
        assertEquals("One", bidding.viewFor(players.get(0).playerId()).activePlayer());
    }

    @Test
    void theSameSeedGivesTheSameDeals() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));

        BiddingState first = new BiddingState(players, GameVariant.CONTREE, 3, new Random(5));
        BiddingState second = new BiddingState(players, GameVariant.CONTREE, 3, new Random(5));
        BiddingState other = new BiddingState(players, GameVariant.CONTREE, 3, new Random(6));

        for (GameBoard.GamePlayer player : players) {
            assertEquals(first.viewFor(player.playerId()).hand(), second.viewFor(player.playerId()).hand());
        }
        assertNotEquals(first.viewFor(players.getFirst().playerId()).hand(),
                other.viewFor(players.getFirst().playerId()).hand());
    }

    @Test
    void theFirstRoundOnlyAcceptsTheUpturnedSuitAndTheSecondAnyOther() {
        List<GameBoard.GamePlayer> players = players();
        BiddingState bidding = new BiddingState(players, GameVariant.CLASSIC, 3);
        UUID first = bidding.activePlayerId();
        GameCard.Suit upturned = bidding.viewFor(first).upturnedCard().suit();
        GameCard.Suit other = otherSuit(upturned);

        assertEquals("In the first round, you may only accept the upturned suit.", assertThrows(
                PrivateTableConflictException.class, () -> bidding.chooseTrump(first, other)).getMessage());
        for (int turn = 0; turn < 4; turn++) {
            bidding.pass(bidding.activePlayerId());
        }
        assertEquals("Choose a suit other than the upturned suit.", assertThrows(PrivateTableConflictException.class,
                () -> bidding.chooseTrump(first, upturned)).getMessage());

        GameBoard board = bidding.chooseTrump(first, other);
        assertEquals(other.displayName(), board.viewFor(first).trump());
    }

    @Test
    void onlyThePlayerWhoseTurnItIsMaySpeakUntilTheAuctionEnds() {
        List<GameBoard.GamePlayer> players = players();
        BiddingState bidding = new BiddingState(players, GameVariant.CLASSIC, 3);
        UUID first = bidding.activePlayerId();
        UUID second = players.get(1).playerId();

        assertEquals("It is not your turn to bid.",
                assertThrows(PrivateTableConflictException.class, () -> bidding.pass(second)).getMessage());

        bidding.chooseTrump(first, bidding.viewFor(first).upturnedCard().suit());

        assertEquals("The auction has ended.", assertThrows(PrivateTableConflictException.class,
                () -> bidding.pass(bidding.activePlayerId())).getMessage());
        assertTrue(bidding.viewFor(first).complete());
    }

    @Test
    void eachVariantOnlyAcceptsItsOwnCalls() {
        BiddingState classic = new BiddingState(players(), GameVariant.CLASSIC, 3);
        BiddingState contree = new BiddingState(players(), GameVariant.CONTREE, 3);
        UUID classicTurn = classic.activePlayerId();
        UUID contreeTurn = contree.activePlayerId();

        assertEquals("Contract bids are only available in Contrée.", assertThrows(PrivateTableConflictException.class,
                () -> classic.bid(classicTurn, 80, GameCard.Suit.HEARTS)).getMessage());
        assertThrows(PrivateTableConflictException.class, () -> classic.coinche(classicTurn));
        assertEquals("Choose a contract value and suit in Contrée.", assertThrows(PrivateTableConflictException.class,
                () -> contree.chooseTrump(contreeTurn, GameCard.Suit.HEARTS)).getMessage());
    }

    @Test
    void nobodyMayCoincheBeforeTheFirstBid() {
        BiddingState contree = new BiddingState(players(), GameVariant.CONTREE, 3);
        UUID first = contree.activePlayerId();

        assertThrows(PrivateTableConflictException.class, () -> contree.coinche(first));
        assertFalse(contree.viewFor(first).coincheAllowed());
    }

    @Test
    void anAuctionNeedsFourPlayers() {
        assertThrows(IllegalArgumentException.class, () -> new BiddingState(players().subList(0, 3)));
    }

    private static List<GameBoard.GamePlayer> players() {
        return List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));
    }

    @Test
    void completedBoardKeepsTheAnnouncementsFlag() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(UUID.randomUUID(), "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three"));
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE).announcements(true);

        bidding.bid(bidding.activePlayerId(), 80, GameCard.Suit.HEARTS);
        for (int turn = 0; turn < 3; turn++) bidding.pass(bidding.activePlayerId());

        assertTrue(bidding.announcements());
        assertTrue(bidding.completedBoard().viewFor(players.get(0).playerId()).announcements());
    }

    private static GameCard.Suit otherSuit(GameCard.Suit suit) {
        return suit == GameCard.Suit.HEARTS ? GameCard.Suit.SPADES : GameCard.Suit.HEARTS;
    }
}
