package fr.beelot.game;

import java.util.Comparator;
import java.util.List;

/**
 * A tierce, cinquante, cent or carré (US-060). A sequence lists its cards from the lowest; a carré has no suit.
 */
public record Announcement(Kind kind, List<GameCard> cards, int value, GameCard.Suit suit) {

    public enum Kind { TIERCE, CINQUANTE, CENT, CARRE }

    public Announcement {
        cards = List.copyOf(cards);
    }

    /** The highest card, in the order A, K, Q, J, 10, 9, 8, 7. */
    public GameCard topCard() {
        return cards.stream().max(Comparator.comparingInt(card -> Announcements.rankHeight(card.rank()))).orElseThrow();
    }
}
