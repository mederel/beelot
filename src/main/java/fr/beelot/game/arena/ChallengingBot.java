package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.SamplingStrategy;

import java.util.random.RandomGenerator;

/** The Challenging bot: it samples and solves deals before playing a card, with the default settings and seed 1. */
final class ChallengingBot implements ArenaBot {

    private final BotStrategy strategy = new SamplingStrategy(1);

    @Override
    public String name() {
        return "challenging";
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
