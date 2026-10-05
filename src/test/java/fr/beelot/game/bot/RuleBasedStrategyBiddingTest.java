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
        var view = contreeView(80, BID_SUIT, 0, card("J", BID_SUIT), card("7", GameCard.Suit.CLUBS),
                card("8", GameCard.Suit.CLUBS), card("9", GameCard.Suit.CLUBS), card("7", GameCard.Suit.DIAMONDS),
                card("8", GameCard.Suit.DIAMONDS), card("7", GameCard.Suit.SPADES), card("8", GameCard.Suit.SPADES));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view),
                "the jack of the opponent's suit would support a partner, not an opponent");
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

    @Test
    void estimatesTheContractFromTrumpsTrumpHonoursAndSideAces() {
        GameCard.Suit trump = GameCard.Suit.SPADES;
        assertEquals(50 + 4 * 7 + 22 + 10 + 6 + 2 * 8, RuleBasedStrategy.contractEstimate(strongSpades(), trump));
        assertEquals(50 + 2 * 7 + 3 * 8, RuleBasedStrategy.contractEstimate(strongSpades(), GameCard.Suit.DIAMONDS),
                "diamonds: two low trumps and three aces in other suits");
    }

    @Test
    void opensAtTheLevelOfItsEstimate() {
        var view = contreeView(0, null, -1, strongSpades().toArray(GameCard[]::new));

        assertEquals(new AuctionDecision.Bid(110, GameCard.Suit.SPADES), new RuleBasedStrategy().decideAuction(view),
                "an estimate of 132 less the margin of 15, rounded down to 110");
    }

    @Test
    void passesInsteadOfOpeningWithAWeakHand() {
        var view = contreeView(0, null, -1, card("J", GameCard.Suit.SPADES), card("7", GameCard.Suit.SPADES),
                card("A", GameCard.Suit.HEARTS), card("8", GameCard.Suit.CLUBS), card("9", GameCard.Suit.CLUBS),
                card("7", GameCard.Suit.DIAMONDS), card("8", GameCard.Suit.DIAMONDS), card("8", GameCard.Suit.HEARTS));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view),
                "spades estimate 50 + 14 + 22 + 8 = 94, below 80 after the margin");
    }

    @Test
    void overcallsAnOpponentsLowerContract() {
        var view = contreeView(90, GameCard.Suit.HEARTS, 0, strongSpades().toArray(GameCard[]::new));

        assertEquals(new AuctionDecision.Bid(110, GameCard.Suit.SPADES), new RuleBasedStrategy().decideAuction(view));
    }

    @Test
    void doesNotOvercallAContractAtOrAboveItsEstimate() {
        var view = contreeView(110, GameCard.Suit.HEARTS, 0, strongSpades().toArray(GameCard[]::new));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view));
    }

    @Test
    void supportsItsPartnerRatherThanOvercallingIt() {
        var view = contreeView(80, GameCard.Suit.HEARTS, 3, strongSpades().toArray(GameCard[]::new));

        assertEquals(new AuctionDecision.Bid(100, GameCard.Suit.HEARTS), new RuleBasedStrategy().decideAuction(view),
                "a heart and two aces elsewhere: the partner support adds 20 in hearts instead of bidding spades");
    }

    /** Jack, nine, ace and ten of spades, with the aces of hearts and clubs. */
    @Test
    void estimatesItsDefensivePointsFromTrumpsTrumpHonoursSideAcesAndTensAndTheContract() {
        List<GameCard> hand = List.of(card("J", BID_SUIT), card("9", BID_SUIT), card("7", BID_SUIT),
                card("A", GameCard.Suit.SPADES), card("10", GameCard.Suit.CLUBS), card("7", GameCard.Suit.DIAMONDS),
                card("8", GameCard.Suit.DIAMONDS), card("7", GameCard.Suit.CLUBS));

        assertEquals(150 - 130 + 3 * 6 + 9 + 7 + 4 + 3, RuleBasedStrategy.defensiveEstimate(hand, BID_SUIT, 100));
    }

    @Test
    void coinchesAnOpponentsContractItExpectsToDefeat() {
        var view = coincheView(120, card("J", BID_SUIT), card("9", BID_SUIT), card("A", BID_SUIT), card("7", BID_SUIT),
                card("A", GameCard.Suit.SPADES), card("10", GameCard.Suit.SPADES), card("A", GameCard.Suit.CLUBS),
                card("10", GameCard.Suit.CLUBS));

        assertEquals(new AuctionDecision.Coinche(), new RuleBasedStrategy().decideAuction(view));
    }

    @Test
    void passesOnAnOpponentsContractItMayNotDefeat() {
        var view = coincheView(120, card("7", BID_SUIT), card("8", BID_SUIT), card("A", GameCard.Suit.SPADES),
                card("7", GameCard.Suit.SPADES), card("10", GameCard.Suit.CLUBS), card("7", GameCard.Suit.CLUBS),
                card("7", GameCard.Suit.DIAMONDS), card("8", GameCard.Suit.DIAMONDS));

        assertEquals(AuctionDecision.PASS, new RuleBasedStrategy().decideAuction(view));
    }

    @Test
    void overcallsRatherThanCoinchingWhenItsOwnContractIsHigher() {
        List<GameCard> hand = List.of(card("J", BID_SUIT), card("9", BID_SUIT), card("J", GameCard.Suit.SPADES),
                card("9", GameCard.Suit.SPADES), card("A", GameCard.Suit.SPADES), card("10", GameCard.Suit.SPADES),
                card("A", GameCard.Suit.CLUBS), card("7", GameCard.Suit.DIAMONDS));
        var view = coincheView(80, hand.toArray(GameCard[]::new));

        assertEquals(85, RuleBasedStrategy.defensiveEstimate(hand, BID_SUIT, 80), "enough to coinche the 80 contract");
        assertEquals(new AuctionDecision.Bid(100, GameCard.Suit.SPADES), new RuleBasedStrategy().decideAuction(view));
    }

    private static List<GameCard> strongSpades() {
        return List.of(card("J", GameCard.Suit.SPADES), card("9", GameCard.Suit.SPADES), card("A", GameCard.Suit.SPADES),
                card("10", GameCard.Suit.SPADES), card("A", GameCard.Suit.HEARTS), card("A", GameCard.Suit.CLUBS),
                card("7", GameCard.Suit.DIAMONDS), card("8", GameCard.Suit.DIAMONDS));
    }

    /** The bot sits in seat 1; its partner is seat 3. */
    private static BiddingState.AuctionView contreeView(int highestBid, GameCard.Suit suit, int bidder, GameCard... hand) {
        return new BiddingState.AuctionView(1, List.of(hand), null, 1, GameVariant.CONTREE, 0, List.of(), highestBid,
                suit, bidder, false);
    }

    /** An opponent at seat 0 holds the given hearts contract, and the bot at seat 1 may coinche it. */
    private static BiddingState.AuctionView coincheView(int highestBid, GameCard... hand) {
        return new BiddingState.AuctionView(1, List.of(hand), null, 1, GameVariant.CONTREE, 0, List.of(), highestBid,
                BID_SUIT, 0, true);
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
