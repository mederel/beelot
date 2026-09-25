package fr.beelot.game;

import java.util.List;
import java.util.UUID;

public final class BotPlayers {

    private BotPlayers() {
    }

    public static void takeAuctionTurn(BiddingState bidding, GameVariant variant) {
        UUID botPlayer = bidding.activePlayerId();
        BiddingState.BiddingView view = bidding.viewFor(botPlayer);
        if (variant == GameVariant.CONTREE && view.highestBid() == 0) {
            bidding.bid(botPlayer, 80, strongestSuit(view.hand()));
        } else {
            bidding.pass(botPlayer);
        }
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
