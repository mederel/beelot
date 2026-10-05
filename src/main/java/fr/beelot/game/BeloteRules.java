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

    /**
     * The cards of the hand that may be played on the given trick, in hand order. A player must follow the suit led,
     * overtrumping when trumps are led. A player who cannot follow must trump, overtrumping when possible, unless
     * their partner is winning the trick.
     */
    public static List<GameCard> legalCards(List<GameCard> hand, List<GameCard> trick, GameCard.Suit trump) {
        if (trick.isEmpty()) return List.copyOf(hand);
        GameCard.Suit lead = trick.getFirst().suit();
        int winner = winningIndex(trick, trump);
        List<GameCard> leadCards = hand.stream().filter(card -> card.suit() == lead).toList();
        if (!leadCards.isEmpty()) {
            if (lead != trump) return leadCards;
            List<GameCard> higher = higherTrumps(leadCards, trick.get(winner), trump);
            return higher.isEmpty() ? leadCards : higher;
        }
        boolean partnerWinning = winner == trick.size() - 2;
        if (partnerWinning) return List.copyOf(hand);
        List<GameCard> trumps = hand.stream().filter(card -> card.suit() == trump).toList();
        if (trumps.isEmpty()) return List.copyOf(hand);
        List<GameCard> higher = higherTrumps(trumps, trick.get(winner), trump);
        return higher.isEmpty() ? trumps : higher;
    }

    private static List<GameCard> higherTrumps(List<GameCard> trumps, GameCard winner, GameCard.Suit trump) {
        if (winner.suit() != trump) return trumps;
        return trumps.stream().filter(card -> strength(card, trump) > strength(winner, trump)).toList();
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
