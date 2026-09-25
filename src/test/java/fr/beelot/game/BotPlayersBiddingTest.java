package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BotPlayersBiddingTest {

    private static final GameCard.Suit BID_SUIT = GameCard.Suit.HEARTS;

    private final List<GameBoard.GamePlayer> players = List.of(
            player("Ana"), player("Ben"), player("Chloe"), player("David"));

    @Test
    void raisesByTwentyWithTheJackOfTheBidSuit() {
        assertEquals(20, BotPlayers.supportRaise(List.of(card("J", BID_SUIT), card("7", GameCard.Suit.CLUBS)), BID_SUIT));
    }

    @Test
    void raisesByTwentyWithTwoAcesElsewhereAndSomeCardsOfTheBidSuit() {
        assertEquals(20, BotPlayers.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", GameCard.Suit.SPADES),
                card("7", BID_SUIT), card("8", BID_SUIT)), BID_SUIT));
    }

    @Test
    void raisesByTenWithAnAceElsewhereAndTheNineOfTheBidSuit() {
        assertEquals(10, BotPlayers.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("9", BID_SUIT)), BID_SUIT));
    }

    @Test
    void raisesByTenWithTwoAcesElsewhereAndNoCardOfTheBidSuit() {
        assertEquals(10, BotPlayers.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", GameCard.Suit.SPADES),
                card("7", GameCard.Suit.DIAMONDS)), BID_SUIT));
    }

    @Test
    void doesNotRaiseWithoutSupport() {
        assertEquals(0, BotPlayers.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", BID_SUIT),
                card("10", BID_SUIT)), BID_SUIT));
        assertEquals(0, BotPlayers.supportRaise(List.of(card("9", BID_SUIT), card("K", GameCard.Suit.CLUBS)), BID_SUIT));
    }

    @Test
    void botSupportsItsPartnersBidInTheSameSuit() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        int raise = BotPlayers.supportRaise(bidding.viewFor(players.get(2).playerId()).hand(), BID_SUIT);

        BotPlayers.takeAuctionTurn(bidding, GameVariant.CONTREE);

        BiddingState.BiddingView view = bidding.viewFor(players.get(0).playerId());
        assertEquals(80 + raise, view.highestBid());
        assertEquals(BID_SUIT, view.highestBidSuit());
        assertEquals(raise > 0 ? "Chloe" : "Ana", view.highestBidder());
    }

    @Test
    void botDoesNotSupportAnOpponentsBid() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);

        BotPlayers.takeAuctionTurn(bidding, GameVariant.CONTREE);

        assertEquals(80, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    @Test
    void botThatAlreadyBidDoesNotRaiseItsPartnersSupport() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        bidding.bid(players.get(2).playerId(), 100, BID_SUIT);
        bidding.pass(players.get(3).playerId());

        BotPlayers.takeAuctionTurn(bidding, GameVariant.CONTREE);

        assertEquals(100, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    @Test
    void botRaiseIsCappedAtTheMaximumContract() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 150, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        int raise = BotPlayers.supportRaise(bidding.viewFor(players.get(2).playerId()).hand(), BID_SUIT);

        BotPlayers.takeAuctionTurn(bidding, GameVariant.CONTREE);

        assertEquals(raise > 0 ? 160 : 150, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }

    private static GameBoard.GamePlayer player(String name) {
        return new GameBoard.GamePlayer(UUID.randomUUID(), name);
    }
}
