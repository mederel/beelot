package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The views bots decide from show only what their player can see. */
class PlayerViewsTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            player("Ana"), player("Ben"), player("Chloe"), player("David"));

    /** The table animates the taker receiving the upturned card, so every player sees who took the contract. */
    @Test
    void everyPlayerSeesWhichSeatTookTheContract() {
        GameBoard board = GameBoard.fromBidding(players, dealtHands(), GameCard.Suit.HEARTS, 3);

        for (GameBoard.GamePlayer player : players) {
            assertEquals(3, board.viewFor(player.playerId()).declaringPlayerIndex());
        }
    }

    @Test
    void playViewShowsTheOwnHandAndEveryPlayedCardWithItsSeat() {
        Map<UUID, List<GameCard>> hands = dealtHands();
        GameBoard board = GameBoard.fromBidding(players, hands, GameCard.Suit.HEARTS, 1);
        List<GameCard> played = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) {
            UUID player = board.activePlayerId();
            GameCard card = board.playViewFor(player).legalCards().getFirst();
            board.play(player, card);
            played.add(card);
        }

        GameBoard.PlayView reviewing = board.playViewFor(players.get(2).playerId());
        assertEquals(List.of(), reviewing.legalCards(), "nobody plays while the trick is being reviewed");
        assertEquals(List.of(), reviewing.currentTrick());

        board.continueAfterTrick();
        UUID leader = board.activePlayerId();
        GameCard lead = board.playViewFor(leader).legalCards().getFirst();
        board.play(leader, lead);

        GameBoard.PlayView view = board.playViewFor(players.get(2).playerId());
        List<GameCard> chloeHand = new ArrayList<>(hands.get(players.get(2).playerId()));
        chloeHand.removeAll(played);
        chloeHand.remove(lead);
        assertEquals(chloeHand, view.hand(), "only the player's own remaining cards, in the order they were dealt");
        assertEquals(2, view.seat());
        assertEquals(GameCard.Suit.HEARTS, view.trump());
        assertEquals(1, view.declaringSeat());
        assertFalse(view.declaring());
        assertEquals(1, view.tricks().size());
        assertEquals(List.of(0, 1, 2, 3), view.tricks().getFirst().stream().map(GameBoard.SeatCard::seat).toList());
        assertEquals(played, view.tricks().getFirst().stream().map(GameBoard.SeatCard::card).toList());
        assertEquals(List.of(new GameBoard.SeatCard(indexOf(leader), lead)), view.currentTrick());
    }

    @Test
    void auctionViewShowsTheOwnHandAndTheCallsWithTheirSeats() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, GameCard.Suit.HEARTS);
        bidding.pass(players.get(1).playerId());

        BiddingState.AuctionView chloe = bidding.auctionViewFor(players.get(2).playerId());
        assertEquals(2, chloe.seat());
        assertEquals(8, chloe.hand().size());
        assertTrue(bidding.viewFor(players.get(2).playerId()).hand().containsAll(chloe.hand()));
        assertEquals(List.of(
                new BiddingState.SeatCall(0, BiddingState.CallType.BID, 80, GameCard.Suit.HEARTS),
                new BiddingState.SeatCall(1, BiddingState.CallType.PASS, 0, null)), chloe.auction());
        assertEquals(0, chloe.highestBidderSeat());
        assertTrue(chloe.partnerHoldsContract());
        assertFalse(chloe.hasBid());
        assertFalse(chloe.coincheAllowed());

        BiddingState.AuctionView ana = bidding.auctionViewFor(players.get(0).playerId());
        assertFalse(ana.partnerHoldsContract(), "a player does not support their own bid");
        assertTrue(ana.hasBid());
    }

    private int indexOf(UUID playerId) {
        for (int index = 0; index < players.size(); index++) {
            if (players.get(index).playerId().equals(playerId)) return index;
        }
        throw new IllegalArgumentException("Unknown player");
    }

    private Map<UUID, List<GameCard>> dealtHands() {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) deck.add(new GameCard(rank, suit));
        }
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int index = 0; index < players.size(); index++) {
            hands.put(players.get(index).playerId(), deck.subList(index * 8, index * 8 + 8));
        }
        return hands;
    }

    private static GameBoard.GamePlayer player(String name) {
        return new GameBoard.GamePlayer(UUID.randomUUID(), name);
    }
}
