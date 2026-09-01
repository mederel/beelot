package com.beelot.game;

public record GameCard(String rank, Suit suit) {

    public enum Suit {
        CLUBS("♣"), DIAMONDS("♦"), HEARTS("♥"), SPADES("♠");

        private final String symbol;

        Suit(String symbol) {
            this.symbol = symbol;
        }

        public String symbol() {
            return symbol;
        }
    }
}
