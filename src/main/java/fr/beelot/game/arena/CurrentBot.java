package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.BotPlayers;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameVariant;

import java.util.random.RandomGenerator;

/** The bot players use in the application. */
final class CurrentBot implements ArenaBot {

    @Override
    public String name() {
        return "current";
    }

    @Override
    public void takeAuctionTurn(BiddingState bidding, GameVariant variant, RandomGenerator random) {
        BotPlayers.takeAuctionTurn(bidding, variant);
    }

    @Override
    public void playCard(GameBoard board, RandomGenerator random) {
        board.playAutomatedTurn();
    }
}
