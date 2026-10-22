package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.random.RandomGenerator;

/** Reference bot: plays like the current bot, but bids as though the round played without announcements (US-061). */
final class NoAnnouncementBiddingBot implements ArenaBot {

    private final BotStrategy strategy = new RuleBasedStrategy();

    @Override
    public String name() {
        return "no-announcement-bidding";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        return strategy.decideAuction(new BiddingState.AuctionView(view.seat(), view.hand(), view.upturnedCard(),
                view.round(), view.variant(), view.dealerIndex(), view.auction(), view.highestBid(),
                view.highestBidSuit(), view.highestBidderSeat(), view.coincheAllowed(), false));
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        return strategy.chooseCard(view);
    }
}
