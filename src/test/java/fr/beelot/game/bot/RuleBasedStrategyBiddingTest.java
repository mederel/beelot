package fr.beelot.game.bot;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RuleBasedStrategyBiddingTest {

    private static final GameCard.Suit BID_SUIT = GameCard.Suit.HEARTS;

    private final List<GameBoard.GamePlayer> players = List.of(
            player("Ana"), player("Ben"), player("Chloe"), player("David"));

    @Test
    void raisesByTwentyWithTheJackOfTheBidSuit() {
        assertEquals(20, RuleBasedStrategy.supportRaise(List.of(card("J", BID_SUIT), card("7", GameCard.Suit.CLUBS)), BID_SUIT));
    }

    @Test
    void raisesByTwentyWithTwoAcesElsewhereAndSomeCardsOfTheBidSuit() {
        assertEquals(20, RuleBasedStrategy.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", GameCard.Suit.SPADES),
                card("7", BID_SUIT), card("8", BID_SUIT)), BID_SUIT));
    }

    @Test
    void raisesByTenWithAnAceElsewhereAndTheNineOfTheBidSuit() {
        assertEquals(10, RuleBasedStrategy.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("9", BID_SUIT)), BID_SUIT));
    }

    @Test
    void raisesByTenWithTwoAcesElsewhereAndNoCardOfTheBidSuit() {
        assertEquals(10, RuleBasedStrategy.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", GameCard.Suit.SPADES),
                card("7", GameCard.Suit.DIAMONDS)), BID_SUIT));
    }

    @Test
    void doesNotRaiseWithoutSupport() {
        assertEquals(0, RuleBasedStrategy.supportRaise(List.of(card("A", GameCard.Suit.CLUBS), card("A", BID_SUIT),
                card("10", BID_SUIT)), BID_SUIT));
        assertEquals(0, RuleBasedStrategy.supportRaise(List.of(card("9", BID_SUIT), card("K", GameCard.Suit.CLUBS)), BID_SUIT));
    }

    @Test
    void botSupportsItsPartnersBidInTheSameSuit() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        int raise = RuleBasedStrategy.supportRaise(bidding.viewFor(players.get(2).playerId()).hand(), BID_SUIT);

        BotTurns.takeAuctionTurn(bidding, new RuleBasedStrategy());

        BiddingState.BiddingView view = bidding.viewFor(players.get(0).playerId());
        assertEquals(80 + raise, view.highestBid());
        assertEquals(BID_SUIT, view.highestBidSuit());
        assertEquals(raise > 0 ? "Chloe" : "Ana", view.highestBidder());
    }

    @Test
    void botDoesNotSupportAnOpponentsBid() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);

        BotTurns.takeAuctionTurn(bidding, new RuleBasedStrategy());

        assertEquals(80, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    @Test
    void botThatAlreadyBidDoesNotRaiseItsPartnersSupport() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 80, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        bidding.bid(players.get(2).playerId(), 100, BID_SUIT);
        bidding.pass(players.get(3).playerId());

        BotTurns.takeAuctionTurn(bidding, new RuleBasedStrategy());

        assertEquals(100, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    @Test
    void botRaiseIsCappedAtTheMaximumContract() {
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE);
        bidding.bid(players.get(0).playerId(), 150, BID_SUIT);
        bidding.pass(players.get(1).playerId());
        int raise = RuleBasedStrategy.supportRaise(bidding.viewFor(players.get(2).playerId()).hand(), BID_SUIT);

        BotTurns.takeAuctionTurn(bidding, new RuleBasedStrategy());

        assertEquals(raise > 0 ? 160 : 150, bidding.viewFor(players.get(0).playerId()).highestBid());
    }

    @Test
    void scoresAClassicHandFromItsTrumpHonoursTrumpsAcesAndBelote() {
        GameCard.Suit trump = GameCard.Suit.SPADES;
        assertEquals(4 + 3, RuleBasedStrategy.handScore(List.of(card("J", trump), card("9", trump),
                card("7", GameCard.Suit.CLUBS)), trump), "jack 3 + 1, nine 2 + 1, nothing for a low side card");
        assertEquals(1 + 1 + 1 + 1 + 1, RuleBasedStrategy.handScore(List.of(card("K", trump), card("Q", trump),
                card("A", GameCard.Suit.HEARTS), card("A", GameCard.Suit.CLUBS)), trump), "two trumps, two aces, belote");
        assertEquals(0, RuleBasedStrategy.handScore(List.of(card("K", GameCard.Suit.HEARTS),
                card("8", GameCard.Suit.CLUBS)), trump));
        assertEquals(1, RuleBasedStrategy.handScore(List.of(card("A", trump)), trump), "a trump ace counts as a trump");
    }

    @Test
    void acceptsTheUpturnedSuitInTheFirstRoundWithAStrongHand() {
        GameCard upturned = card("7", GameCard.Suit.SPADES);
        var view = classicView(1, upturned, card("J", GameCard.Suit.SPADES), card("9", GameCard.Suit.SPADES),
                card("8", GameCard.Suit.CLUBS), card("7", GameCard.Suit.HEARTS), card("8", GameCard.Suit.HEARTS));

        assertEquals(new AuctionDecision.ChooseTrump(GameCard.Suit.SPADES), new RuleBasedStrategy().decideAuction(view),
                "jack and nine of trumps plus the upturned seven score 4 + 3 + 1");
    }

    @Test
    void passesInTheFirstRoundBelowTheThreshold() {
        GameCard upturned = card("7", GameCard.Suit.SPADES);
        var view = classicView(1, upturned, card("J", GameCard.Suit.SPADES), card("8", GameCard.Suit.CLUBS),
                card("7", GameCard.Suit.HEARTS), card("8", GameCard.Suit.HEARTS), card("9", GameCard.Suit.CLUBS));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view), "jack and one more trump: 5");
    }

    @Test
    void choosesItsBestOtherSuitInTheSecondRound() {
        GameCard upturned = card("J", GameCard.Suit.SPADES);
        var view = classicView(2, upturned, card("J", GameCard.Suit.HEARTS), card("9", GameCard.Suit.HEARTS),
                card("A", GameCard.Suit.CLUBS), card("Q", GameCard.Suit.SPADES), card("K", GameCard.Suit.SPADES));

        assertEquals(new AuctionDecision.ChooseTrump(GameCard.Suit.HEARTS), new RuleBasedStrategy().decideAuction(view),
                "hearts score 4 + 3 + 1 for the ace; spades, the upturned suit, may not be chosen");
    }

    @Test
    void passesInTheSecondRoundWhenNoOtherSuitIsStrongEnough() {
        GameCard upturned = card("J", GameCard.Suit.SPADES);
        var view = classicView(2, upturned, card("9", GameCard.Suit.SPADES), card("A", GameCard.Suit.SPADES),
                card("8", GameCard.Suit.CLUBS), card("7", GameCard.Suit.HEARTS), card("10", GameCard.Suit.DIAMONDS));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view));
    }

    private static BiddingState.AuctionView classicView(int round, GameCard upturned, GameCard... hand) {
        return new BiddingState.AuctionView(1, List.of(hand), upturned, round, GameVariant.CLASSIC, 0, List.of(), 0,
                null, -1, false);
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }

    private static GameBoard.GamePlayer player(String name) {
        return new GameBoard.GamePlayer(UUID.randomUUID(), name);
    }
}
