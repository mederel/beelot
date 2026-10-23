package fr.beelot.game;

import java.util.List;
import java.util.Map;

/** Card ranking and points under a trump suit, all trumps or no trumps, shared by the rules engine and the bots. */
public final class BeloteRules {

    private static final List<String> TRUMP_ORDER = List.of("7", "8", "Q", "K", "10", "A", "9", "J");
    private static final List<String> NORMAL_ORDER = List.of("7", "8", "9", "J", "Q", "K", "10", "A");

    private static final Map<String, Integer> ALL_TRUMPS_POINTS =
            Map.of("J", 13, "9", 9, "A", 6, "10", 5, "K", 3, "Q", 2);
    private static final Map<String, Integer> NO_TRUMPS_POINTS =
            Map.of("A", 19, "10", 10, "K", 4, "Q", 3, "J", 2);

    private BeloteRules() {
    }

    /** The card's rank within its suit: a higher value beats a lower one of the same suit. */
    public static int strength(GameCard card, Trump trump) {
        return (trump.isTrump(card.suit()) ? TRUMP_ORDER : NORMAL_ORDER).indexOf(card.rank());
    }

    public static int points(GameCard card, Trump trump) {
        if (trump == Trump.ALL_TRUMPS) return ALL_TRUMPS_POINTS.getOrDefault(card.rank(), 0);
        if (trump == Trump.NO_TRUMPS) return NO_TRUMPS_POINTS.getOrDefault(card.rank(), 0);
        return switch (card.rank()) {
            case "A" -> 11;
            case "10" -> 10;
            case "K" -> 4;
            case "Q" -> 3;
            case "J" -> trump.isTrump(card.suit()) ? 20 : 2;
            case "9" -> trump.isTrump(card.suit()) ? 14 : 0;
            default -> 0;
        };
    }

    /** Whether the contender beats the card currently winning a trick led in the given suit. */
    public static boolean beats(GameCard contender, GameCard winner, GameCard.Suit lead, Trump trump) {
        if (contender.suit() == winner.suit()) return strength(contender, trump) > strength(winner, trump);
        if (!trump.suitContract()) return false;
        return trump.isTrump(contender.suit()) || (!trump.isTrump(winner.suit()) && contender.suit() == lead);
    }

    /**
     * The cards of the hand that may be played on the given trick, in hand order. A player must follow the suit led,
     * overtrumping when trumps are led. A player who cannot follow must trump, overtrumping when possible, unless
     * their partner is winning the trick. Under all trumps a player must follow and overtake the winning card; under
     * no trumps a player must follow, and otherwise plays any card.
     */
    public static List<GameCard> legalCards(List<GameCard> hand, List<GameCard> trick, Trump trump) {
        if (trick.isEmpty()) return List.copyOf(hand);
        GameCard.Suit lead = trick.getFirst().suit();
        int winner = winningIndex(trick, trump);
        List<GameCard> leadCards = hand.stream().filter(card -> card.suit() == lead).toList();
        if (!leadCards.isEmpty()) {
            if (!trump.isTrump(lead)) return leadCards;
            List<GameCard> higher = higherTrumps(leadCards, trick.get(winner), trump);
            return higher.isEmpty() ? leadCards : higher;
        }
        boolean partnerWinning = winner == trick.size() - 2;
        if (partnerWinning || !trump.suitContract()) return List.copyOf(hand);
        List<GameCard> trumps = hand.stream().filter(card -> trump.isTrump(card.suit())).toList();
        if (trumps.isEmpty()) return List.copyOf(hand);
        List<GameCard> higher = higherTrumps(trumps, trick.get(winner), trump);
        return higher.isEmpty() ? trumps : higher;
    }

    private static List<GameCard> higherTrumps(List<GameCard> trumps, GameCard winner, Trump trump) {
        if (!trump.isTrump(winner.suit())) return trumps;
        return trumps.stream().filter(card -> strength(card, trump) > strength(winner, trump)).toList();
    }

    /** The position, in play order, of the card winning the given non-empty trick. */
    public static int winningIndex(List<GameCard> trick, Trump trump) {
        GameCard.Suit lead = trick.getFirst().suit();
        int winner = 0;
        for (int index = 1; index < trick.size(); index++) {
            if (beats(trick.get(index), trick.get(winner), lead, trump)) winner = index;
        }
        return winner;
    }
}
