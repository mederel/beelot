package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.List;
import java.util.random.RandomGenerator;

/**
 * Reference bot: plays its cards like the current bot, but bids as bots did before US-050 and US-051. It never takes
 * a contract in classic Belote; in Contrée, it opens 80 in its longest suit and only ever supports its partner once.
 */
final class BaselineBot implements ArenaBot {

    private static final int MAX_BID = 160;

    private final BotStrategy strategy = new RuleBasedStrategy();

    @Override
    public String name() {
        return "baseline";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        if (view.variant() != GameVariant.CONTREE) return AuctionDecision.PASS;
        if (view.highestBid() == 0) return new AuctionDecision.Bid(80, longestSuit(view.hand()));
        int raise = view.partnerHoldsContract() && !view.hasBid()
                ? RuleBasedStrategy.supportRaise(view.hand(), view.highestBidSuit()) : 0;
        if (raise > 0 && view.highestBid() < MAX_BID) {
            return new AuctionDecision.Bid(Math.min(view.highestBid() + raise, MAX_BID), view.highestBidSuit());
        }
        return AuctionDecision.PASS;
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        return strategy.chooseCard(view);
    }

    private static GameCard.Suit longestSuit(List<GameCard> hand) {
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
