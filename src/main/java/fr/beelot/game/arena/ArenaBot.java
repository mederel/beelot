package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameVariant;

import java.util.List;
import java.util.random.RandomGenerator;

/**
 * A bot strategy the arena can seat. It takes the active player's turn; any randomness must come from the given
 * generator so that a seeded run is repeatable.
 */
public interface ArenaBot {

    List<ArenaBot> AVAILABLE = List.of(new CurrentBot(), new RandomCardBot());

    String name();

    void takeAuctionTurn(BiddingState bidding, GameVariant variant, RandomGenerator random);

    void playCard(GameBoard board, RandomGenerator random);

    static ArenaBot named(String name) {
        return AVAILABLE.stream().filter(bot -> bot.name().equals(name)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown bot " + name + ". Available: "
                        + AVAILABLE.stream().map(ArenaBot::name).toList()));
    }
}
