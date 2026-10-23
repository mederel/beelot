package fr.beelot.game;

/** What a Contrée round is played in: one of the four suits as trump, or all trumps, or no trumps. */
public enum Trump {
    CLUBS("Clubs", GameCard.Suit.CLUBS),
    DIAMONDS("Diamonds", GameCard.Suit.DIAMONDS),
    HEARTS("Hearts", GameCard.Suit.HEARTS),
    SPADES("Spades", GameCard.Suit.SPADES),
    ALL_TRUMPS("All trumps", null),
    NO_TRUMPS("No trumps", null);

    private final String displayName;
    private final GameCard.Suit suit;

    Trump(String displayName, GameCard.Suit suit) {
        this.displayName = displayName;
        this.suit = suit;
    }

    /** The contract trumping the given suit; null for no contract yet. */
    public static Trump of(GameCard.Suit suit) {
        return suit == null ? null : values()[suit.ordinal()];
    }

    /** The trump suit, or null under all trumps and no trumps. */
    public GameCard.Suit suit() {
        return suit;
    }

    /** Whether cards of the given suit are trumps. */
    public boolean isTrump(GameCard.Suit cardSuit) {
        return this == ALL_TRUMPS || (suit != null && suit == cardSuit);
    }

    /** Whether one suit is trump, as in classic Belote. */
    public boolean suitContract() {
        return suit != null;
    }

    public String displayName() {
        return displayName;
    }
}
