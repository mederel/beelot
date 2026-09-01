package com.beelot.game;

public record GameCard(String rank, Suit suit) {

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
