package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.random.RandomGenerator;

/** Reference bot: plays like the current bot but never takes a contract in classic Belote, as before US-050. */
final class PassiveBot implements ArenaBot {

    private final BotStrategy strategy = new RuleBasedStrategy();

    @Override
    public String name() {
        return "passive";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        return view.variant() == GameVariant.CLASSIC ? AuctionDecision.PASS : strategy.decideAuction(view);
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        return strategy.chooseCard(view);
    }
}
