package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;

import java.util.List;
import java.util.random.RandomGenerator;

/**
 * A bot strategy the arena can seat. Like any bot, it only sees its player's view; any randomness must come from the
 * given generator so that a seeded run is repeatable.
 */
public interface ArenaBot {

    List<ArenaBot> AVAILABLE = List.of(new CurrentBot(), new BaselineBot(), new PreviousPlayBot(), new RandomCardBot());

    String name();

    AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random);

    GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random);

    static ArenaBot named(String name) {
        return AVAILABLE.stream().filter(bot -> bot.name().equals(name)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown bot " + name + ". Available: "
                        + AVAILABLE.stream().map(ArenaBot::name).toList()));
    }
}
