package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.List;
import java.util.random.RandomGenerator;

/** Baseline bot: bids like the current bot, then plays a random legal card. */
final class RandomCardBot implements ArenaBot {

    private final BotStrategy bidding = new RuleBasedStrategy();

    @Override
    public String name() {
        return "random";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        return bidding.decideAuction(view);
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
        List<GameCard> legal = view.legalCards();
        return legal.get(random.nextInt(legal.size()));
    }
}
