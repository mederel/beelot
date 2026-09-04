package com.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContreeBiddingStateTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            player("Ana"), player("Ben"), player("Chloe"), player("David"));

    @Test
    void dealsAllCardsAndClosesAContractAfterThreePasses() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);

        assertEquals(8, bidding.viewFor(players.getFirst().playerId()).hand().size());
        assertNull(bidding.viewFor(players.getFirst().playerId()).upturnedCard());

        bidding.bid(players.get(0).playerId(), 90, GameCard.Suit.HEARTS);
        bidding.pass(players.get(1).playerId());
        bidding.pass(players.get(2).playerId());
        bidding.pass(players.get(3).playerId());

        GameBoard.GameBoardView board = bidding.completedBoard().viewFor(players.getFirst().playerId());
        assertEquals(GameVariant.CONTREE, board.variant());
        assertEquals(90, board.contractValue());
        assertEquals("Hearts", board.trump());
        assertFalse(board.coinched());
    }

    @Test
    void opponentCanCoincheButDeclarersPartnerCannot() {
        BiddingState coinched = new BiddingState(players, GameVariant.CONTREE);
        coinched.bid(players.get(0).playerId(), 80, GameCard.Suit.CLUBS);
        assertTrue(coinched.viewFor(players.get(1).playerId()).coincheAllowed());
        coinched.coinche(players.get(1).playerId());
        assertNotNull(coinched.completedBoard());
        assertTrue(coinched.completedBoard().viewFor(players.getFirst().playerId()).coinched());

        BiddingState teammateTurn = new BiddingState(players, GameVariant.CONTREE);
        teammateTurn.bid(players.get(0).playerId(), 80, GameCard.Suit.CLUBS);
        teammateTurn.pass(players.get(1).playerId());
        assertThrows(PrivateTableConflictException.class,
                () -> teammateTurn.coinche(players.get(2).playerId()));
    }

    @Test
    void bidsMustIncreaseByTenWithinTheSupportedRange() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        assertThrows(PrivateTableConflictException.class,
                () -> bidding.bid(players.get(0).playerId(), 80, null));
        assertThrows(PrivateTableConflictException.class,
                () -> bidding.bid(players.get(0).playerId(), 85, GameCard.Suit.SPADES));
        bidding.bid(players.get(0).playerId(), 100, GameCard.Suit.SPADES);
        assertThrows(PrivateTableConflictException.class,
                () -> bidding.bid(players.get(1).playerId(), 100, GameCard.Suit.HEARTS));
    }

    @Test
    void fourOpeningPassesRedealAndReturnTheTurnToTheFirstPlayer() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        for (GameBoard.GamePlayer player : players) bidding.pass(player.playerId());

        BiddingState.BiddingView redealt = bidding.viewFor(players.getFirst().playerId());
        assertEquals(8, redealt.hand().size());
        assertEquals(0, redealt.highestBid());
        assertTrue(redealt.playerTurn());
        assertFalse(redealt.complete());
        assertEquals("Everyone passed. The cards have been redealt.", redealt.message());
    }

    @Test
    void aRaiseRestartsTheThreePassClosureCount() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, GameCard.Suit.CLUBS);
        bidding.pass(players.get(1).playerId());
        bidding.bid(players.get(2).playerId(), 100, GameCard.Suit.HEARTS);
        bidding.pass(players.get(3).playerId());
        bidding.pass(players.get(0).playerId());

        assertNull(bidding.completedBoard());
        bidding.pass(players.get(1).playerId());
        assertEquals(100, bidding.completedBoard().viewFor(players.getFirst().playerId()).contractValue());
        assertEquals("North–South", bidding.completedBoard().viewFor(players.getFirst().playerId()).declaringTeam());
    }

    @Test
    void coincheDoublesTheAwardedRoundScores() {
        Map<UUID, List<GameCard>> hands = completeHands();
        GameBoard normal = GameBoard.fromContract(players, hands, GameCard.Suit.HEARTS, 0, 100, false);
        GameBoard doubled = GameBoard.fromContract(players, hands, GameCard.Suit.HEARTS, 0, 100, true);

        playRound(normal);
        playRound(doubled);

        GameBoard.RoundResult normalResult = normal.viewFor(players.getFirst().playerId()).roundResult();
        GameBoard.RoundResult doubledResult = doubled.viewFor(players.getFirst().playerId()).roundResult();
        assertEquals(normalResult.northSouthAwarded() * 2, doubledResult.northSouthAwarded());
        assertEquals(normalResult.eastWestAwarded() * 2, doubledResult.eastWestAwarded());
    }

    @Test
    void contractOutcomeUsesTheCalledValueAndDeclaringTeam() {
        Map<UUID, List<GameCard>> hands = completeHands();
        GameBoard northSouth = GameBoard.fromContract(players, hands, GameCard.Suit.HEARTS, 0, 160, false);
        GameBoard eastWest = GameBoard.fromContract(players, hands, GameCard.Suit.HEARTS, 1, 80, false);

        playRound(northSouth);
        playRound(eastWest);

        assertTrue(northSouth.viewFor(players.getFirst().playerId()).roundResult().contractMade());
        assertFalse(eastWest.viewFor(players.getFirst().playerId()).roundResult().contractMade());
    }

    private Map<UUID, List<GameCard>> completeHands() {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) {
                deck.add(new GameCard(rank, suit));
            }
        }
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int player = 0; player < 4; player++) {
            hands.put(players.get(player).playerId(), new ArrayList<>(deck.subList(player * 8, player * 8 + 8)));
        }
        return hands;
    }

    private void playRound(GameBoard board) {
        while (board.viewFor(players.getFirst().playerId()).roundResult() == null) {
            if (board.viewFor(players.getFirst().playerId()).reviewingCompletedTrick()) board.continueAfterTrick();
            else board.playAutomatedTurn();
        }
    }

    private static GameBoard.GamePlayer player(String name) {
        return new GameBoard.GamePlayer(UUID.randomUUID(), name);
    }
}
