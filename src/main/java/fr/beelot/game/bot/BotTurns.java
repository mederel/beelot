package fr.beelot.game.bot;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;

import java.util.UUID;

/** Lets a strategy take the active player's turn. */
public final class BotTurns {

    private BotTurns() {
    }

    /** The view and the call are made under the auction's lock, so concurrent requests cannot interleave them. */
    public static void takeAuctionTurn(BiddingState bidding, BotStrategy strategy) {
        synchronized (bidding) {
            UUID player = bidding.activePlayerId();
            apply(bidding, player, strategy.decideAuction(bidding.auctionViewFor(player)));
        }
    }

    public static void apply(BiddingState bidding, UUID player, AuctionDecision decision) {
        switch (decision) {
            case AuctionDecision.Pass pass -> bidding.pass(player);
            case AuctionDecision.Bid bid -> bidding.bid(player, bid.value(), bid.suit());
            case AuctionDecision.Coinche coinche -> bidding.coinche(player);
            case AuctionDecision.ChooseTrump choice -> bidding.chooseTrump(player, choice.suit());
        }
    }

    /** The view and the card are played under the board's lock, so concurrent requests cannot interleave them. */
    public static void playTurn(GameBoard board, BotStrategy strategy) {
        synchronized (board) {
            UUID player = board.activePlayerId();
            board.play(player, strategy.chooseCard(board.playViewFor(player)));
        }
    }
}
