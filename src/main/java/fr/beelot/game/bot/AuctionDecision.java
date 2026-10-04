package fr.beelot.game.bot;

import fr.beelot.game.GameCard;

/** A bot's call in the auction. */
public sealed interface AuctionDecision {

    AuctionDecision PASS = new Pass();

    record Pass() implements AuctionDecision {
    }

    /** A Contrée contract bid. */
    record Bid(int value, GameCard.Suit suit) implements AuctionDecision {
    }

    record Coinche() implements AuctionDecision {
    }

    /** Taking the contract in classic Belote with the given trump suit. */
    record ChooseTrump(GameCard.Suit suit) implements AuctionDecision {
    }
}
