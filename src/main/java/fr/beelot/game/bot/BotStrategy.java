package fr.beelot.game.bot;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;

/**
 * How a bot bids and plays. A strategy only receives what its player can see, so it cannot look at the other
 * hands, and strategies can be swapped without touching the rules engine.
 */
public interface BotStrategy {

    AuctionDecision decideAuction(BiddingState.AuctionView view);

    /** Returns one of the view's legal cards. */
    GameCard chooseCard(GameBoard.PlayView view);
}
