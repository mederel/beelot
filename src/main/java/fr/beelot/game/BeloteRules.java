package fr.beelot.game;

import java.util.List;

/** Card ranking and points under a trump suit, shared by the rules engine and the bots. */
public final class BeloteRules {

    private static final List<String> TRUMP_ORDER = List.of("7", "8", "Q", "K", "10", "A", "9", "J");
    private static final List<String> NORMAL_ORDER = List.of("7", "8", "9", "J", "Q", "K", "10", "A");

    private BeloteRules() {
    }

    /** The card's rank within its suit: a higher value beats a lower one of the same suit. */
    public static int strength(GameCard card, GameCard.Suit trump) {
        return (card.suit() == trump ? TRUMP_ORDER : NORMAL_ORDER).indexOf(card.rank());
    }

    public static int points(GameCard card, GameCard.Suit trump) {
        return switch (card.rank()) {
            case "A" -> 11;
            case "10" -> 10;
            case "K" -> 4;
            case "Q" -> 3;
            case "J" -> card.suit() == trump ? 20 : 2;
            case "9" -> card.suit() == trump ? 14 : 0;
            default -> 0;
        };
    }

    /** Whether the contender beats the card currently winning a trick led in the given suit. */
    public static boolean beats(GameCard contender, GameCard winner, GameCard.Suit lead, GameCard.Suit trump) {
        if (contender.suit() == winner.suit()) return strength(contender, trump) > strength(winner, trump);
        return contender.suit() == trump || (winner.suit() != trump && contender.suit() == lead);
    }

    /** The position, in play order, of the card winning the given non-empty trick. */
    public static int winningIndex(List<GameCard> trick, GameCard.Suit trump) {
        GameCard.Suit lead = trick.getFirst().suit();
        int winner = 0;
        for (int index = 1; index < trick.size(); index++) {
            if (beats(trick.get(index), trick.get(winner), lead, trump)) winner = index;
        }
        return winner;
    }
}
