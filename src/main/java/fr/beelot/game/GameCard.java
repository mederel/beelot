package fr.beelot.game;

import java.util.Comparator;
import java.util.List;

public record GameCard(String rank, Suit suit) {

    private static final List<String> NORMAL_DISPLAY_ORDER = List.of("7", "8", "9", "J", "Q", "K", "10", "A");
    private static final List<String> TRUMP_DISPLAY_ORDER = List.of("7", "8", "Q", "K", "10", "A", "9", "J");

    /** Hand sorting: the trump suit first when there is one; a null trump is the auction's natural order. */
    public static Comparator<GameCard> displayOrder(Trump trump) {
        return Comparator.comparingInt((GameCard card) -> suitOrder(card.suit(), trump))
                .thenComparingInt(card -> rankOrder(card, trump));
    }

    private static int suitOrder(Suit suit, Trump trump) {
        if (trump == null || !trump.suitContract()) return suit.ordinal();
        if (suit == trump.suit()) return 0;
        return suit.ordinal() + (suit.ordinal() < trump.ordinal() ? 1 : 0);
    }

    private static int rankOrder(GameCard card, Trump trump) {
        List<String> order = trump != null && trump.isTrump(card.suit()) ? TRUMP_DISPLAY_ORDER : NORMAL_DISPLAY_ORDER;
        int position = order.indexOf(card.rank());
        return position < 0 ? Integer.MAX_VALUE : position;
    }

    public enum Suit {
        CLUBS("Clubs", "♣"), DIAMONDS("Diamonds", "♦"), HEARTS("Hearts", "♥"), SPADES("Spades", "♠");

        private final String displayName;
        private final String symbol;

        Suit(String displayName, String symbol) {
            this.displayName = displayName;
            this.symbol = symbol;
        }

        public String displayName() {
            return displayName;
        }

        public String symbol() {
            return symbol;
        }
    }
}
