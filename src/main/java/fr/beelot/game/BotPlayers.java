package fr.beelot.game;

import java.util.List;
import java.util.UUID;

public final class BotPlayers {

    private static final int MAX_BID = 160;

    private BotPlayers() {
    }

    public static void takeAuctionTurn(BiddingState bidding, GameVariant variant) {
        UUID botPlayer = bidding.activePlayerId();
        BiddingState.BiddingView view = bidding.viewFor(botPlayer);
        if (variant != GameVariant.CONTREE) {
            bidding.pass(botPlayer);
            return;
        }
        if (view.highestBid() == 0) {
            bidding.bid(botPlayer, 80, strongestSuit(view.hand()));
            return;
        }
        int raise = bidding.partnerHoldsContract(botPlayer) && !bidding.hasBid(botPlayer)
                ? supportRaise(view.hand(), view.highestBidSuit()) : 0;
        if (raise > 0 && view.highestBid() < MAX_BID) {
            bidding.bid(botPlayer, Math.min(view.highestBid() + raise, MAX_BID), view.highestBidSuit());
        } else {
            bidding.pass(botPlayer);
        }
    }

    /**
     * How much a bot raises its partner's bid in the given suit: 20 with the jack of that suit, or with two aces
     * elsewhere and at least one card of that suit; 10 with an ace elsewhere and the nine of that suit, or with two
     * aces elsewhere and no card of that suit; otherwise 0.
     */
    static int supportRaise(List<GameCard> hand, GameCard.Suit suit) {
        boolean jack = hand.contains(new GameCard("J", suit));
        boolean nine = hand.contains(new GameCard("9", suit));
        long otherAces = hand.stream().filter(card -> card.rank().equals("A") && card.suit() != suit).count();
        long suitCards = hand.stream().filter(card -> card.suit() == suit).count();
        if (jack || (otherAces >= 2 && suitCards > 0)) return 20;
        if ((otherAces >= 1 && nine) || otherAces >= 2) return 10;
        return 0;
    }

    public static GameCard.Suit strongestSuit(List<GameCard> hand) {
        GameCard.Suit best = GameCard.Suit.CLUBS;
        long bestCount = -1;
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            long count = hand.stream().filter(card -> card.suit() == suit).count();
            if (count > bestCount) {
                best = suit;
                bestCount = count;
            }
        }
        return best;
    }
}
