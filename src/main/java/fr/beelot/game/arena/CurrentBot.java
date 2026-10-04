package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.random.RandomGenerator;

/** The bot players use in the application. */
final class CurrentBot implements ArenaBot {

    private final BotStrategy strategy = new RuleBasedStrategy();

    @Override
    public String name() {
        return "current";
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
