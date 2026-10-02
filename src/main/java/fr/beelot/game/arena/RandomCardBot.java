package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.BotPlayers;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import java.util.List;
import java.util.UUID;
import java.util.random.RandomGenerator;

/** Baseline bot: bids like the current bot, then plays a random legal card. */
final class RandomCardBot implements ArenaBot {

    @Override
    public String name() {
        return "random";
    }

    @Override
    public void takeAuctionTurn(BiddingState bidding, GameVariant variant, RandomGenerator random) {
        BotPlayers.takeAuctionTurn(bidding, variant);
    }

    @Override
    public void playCard(GameBoard board, RandomGenerator random) {
        UUID player = board.activePlayerId();
        List<GameCard> legal = board.viewFor(player).legalCards();
        board.play(player, legal.get(random.nextInt(legal.size())));
    }
}
