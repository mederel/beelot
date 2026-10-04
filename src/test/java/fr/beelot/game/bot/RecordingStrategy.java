package fr.beelot.game.bot;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;

/** Plays the current rules and counts the decisions it was asked for. */
public final class RecordingStrategy implements BotStrategy {

    private final BotStrategy rules = new RuleBasedStrategy();
    private int auctionDecisions;
    private int cardDecisions;

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view) {
        auctionDecisions++;
        return rules.decideAuction(view);
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view) {
        cardDecisions++;
        return rules.chooseCard(view);
    }

    public int decisions() {
        return auctionDecisions + cardDecisions;
    }

    public int cardDecisions() {
        return cardDecisions;
    }
}
