package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.random.RandomGenerator;

/** Reference bot: bids and plays like the current bot, but passes where it would coinche, as bots did before US-055. */
final class NoCoincheBot implements ArenaBot {

    private final BotStrategy strategy = new RuleBasedStrategy();

    @Override
    public String name() {
        return "no-coinche";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        AuctionDecision decision = strategy.decideAuction(view);
        return decision instanceof AuctionDecision.Coinche ? AuctionDecision.PASS : decision;
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        return strategy.chooseCard(view);
    }
}
