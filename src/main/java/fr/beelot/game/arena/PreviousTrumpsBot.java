package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.random.RandomGenerator;

/** Reference bot: bids like the current bot, but plays its cards as bots did before US-054, without managing trumps. */
final class PreviousTrumpsBot implements ArenaBot {

    private final BotStrategy strategy = RuleBasedStrategy.withoutTrumpControl();

    @Override
    public String name() {
        return "previous-trumps";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        return strategy.decideAuction(view);
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        return strategy.chooseCard(view);
    }
}
