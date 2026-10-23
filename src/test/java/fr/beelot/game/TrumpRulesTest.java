package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;

import static fr.beelot.game.GameCard.Suit.CLUBS;
import static fr.beelot.game.GameCard.Suit.DIAMONDS;
import static fr.beelot.game.GameCard.Suit.HEARTS;
import static fr.beelot.game.GameCard.Suit.SPADES;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrumpRulesTest {

    private static final List<String> RANKS = List.of("7", "8", "9", "10", "J", "Q", "K", "A");

    @Test
    void trumpOfASuit() {
        assertEquals(Trump.HEARTS, Trump.of(HEARTS));
        assertNull(Trump.of(null));
        assertTrue(Trump.HEARTS.isTrump(HEARTS));
        assertFalse(Trump.HEARTS.isTrump(SPADES));
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            assertTrue(Trump.ALL_TRUMPS.isTrump(suit));
            assertFalse(Trump.NO_TRUMPS.isTrump(suit));
        }
        assertNull(Trump.ALL_TRUMPS.suit());
        assertNull(Trump.NO_TRUMPS.suit());
        assertEquals(HEARTS, Trump.HEARTS.suit());
        for (Trump trump : Trump.values()) {
            assertEquals(trump.suit() != null, trump.suitContract());
        }
        assertEquals("All trumps", Trump.ALL_TRUMPS.displayName());
        assertEquals("No trumps", Trump.NO_TRUMPS.displayName());
        assertEquals("Clubs", Trump.CLUBS.displayName());
    }

    @Test
    void eachContractTotals152CardPoints() {
        for (Trump trump : List.of(Trump.HEARTS, Trump.ALL_TRUMPS, Trump.NO_TRUMPS)) {
            int total = 0;
            for (GameCard.Suit suit : GameCard.Suit.values()) {
                for (String rank : RANKS) total += BeloteRules.points(new GameCard(rank, suit), trump);
            }
            assertEquals(152, total, trump.name());
        }
    }

    @Test
    void noTrumpsValues() {
        assertEquals(19, points("A", CLUBS, Trump.NO_TRUMPS));
        assertEquals(10, points("10", CLUBS, Trump.NO_TRUMPS));
        assertEquals(4, points("K", CLUBS, Trump.NO_TRUMPS));
        assertEquals(3, points("Q", CLUBS, Trump.NO_TRUMPS));
        assertEquals(2, points("J", CLUBS, Trump.NO_TRUMPS));
        assertEquals(0, points("9", CLUBS, Trump.NO_TRUMPS));
        assertEquals(0, points("8", CLUBS, Trump.NO_TRUMPS));
    }

    @Test
    void allTrumpsValues() {
        assertEquals(13, points("J", CLUBS, Trump.ALL_TRUMPS));
        assertEquals(9, points("9", DIAMONDS, Trump.ALL_TRUMPS));
        assertEquals(6, points("A", HEARTS, Trump.ALL_TRUMPS));
        assertEquals(5, points("10", HEARTS, Trump.ALL_TRUMPS));
        assertEquals(3, points("K", SPADES, Trump.ALL_TRUMPS));
        assertEquals(2, points("Q", SPADES, Trump.ALL_TRUMPS));
        assertEquals(0, points("7", SPADES, Trump.ALL_TRUMPS));
    }

    @Test
    void noTrumpsOrder() {
        assertEquals(1, BeloteRules.winningIndex(List.of(card("10", HEARTS), card("A", HEARTS)), Trump.NO_TRUMPS));
        assertEquals(0, BeloteRules.winningIndex(List.of(card("J", HEARTS), card("9", HEARTS)), Trump.NO_TRUMPS));
    }

    @Test
    void allTrumpsOrder() {
        assertEquals(1, BeloteRules.winningIndex(List.of(card("A", HEARTS), card("9", HEARTS)), Trump.ALL_TRUMPS));
        assertEquals(1, BeloteRules.winningIndex(List.of(card("9", HEARTS), card("J", HEARTS)), Trump.ALL_TRUMPS));
    }

    @Test
    void anotherSuitNeverWins() {
        assertEquals(0, BeloteRules.winningIndex(List.of(card("7", HEARTS), card("J", SPADES)), Trump.ALL_TRUMPS));
        assertEquals(0, BeloteRules.winningIndex(List.of(card("7", HEARTS), card("A", SPADES)), Trump.NO_TRUMPS));
    }

    @Test
    void noTrumpsFollowsWithoutOvertaking() {
        List<GameCard> hand = List.of(card("7", HEARTS), card("A", HEARTS), card("A", SPADES));

        assertEquals(List.of(card("7", HEARTS), card("A", HEARTS)),
                BeloteRules.legalCards(hand, List.of(card("K", HEARTS)), Trump.NO_TRUMPS));
    }

    @Test
    void noTrumpsDiscardsWhenVoid() {
        List<GameCard> hand = List.of(card("A", SPADES), card("7", CLUBS));

        assertEquals(hand, BeloteRules.legalCards(hand, List.of(card("K", HEARTS)), Trump.NO_TRUMPS));
    }

    @Test
    void allTrumpsMustOvertake() {
        List<GameCard> hand = List.of(card("7", HEARTS), card("9", HEARTS), card("J", SPADES));

        assertEquals(List.of(card("9", HEARTS)),
                BeloteRules.legalCards(hand, List.of(card("A", HEARTS)), Trump.ALL_TRUMPS));
    }

    @Test
    void allTrumpsFollowsLowWhenItCannotBeat() {
        List<GameCard> hand = List.of(card("7", HEARTS), card("8", HEARTS), card("A", SPADES));

        assertEquals(List.of(card("7", HEARTS), card("8", HEARTS)),
                BeloteRules.legalCards(hand, List.of(card("J", HEARTS)), Trump.ALL_TRUMPS));
    }

    @Test
    void allTrumpsDiscardsWhenVoid() {
        List<GameCard> hand = List.of(card("J", SPADES), card("7", CLUBS));

        assertEquals(hand, BeloteRules.legalCards(hand, List.of(card("A", HEARTS)), Trump.ALL_TRUMPS));
    }

    @Test
    void allTrumpsOvertakesTheWinnerNotTheLastCard() {
        List<GameCard> hand = List.of(card("A", HEARTS), card("J", HEARTS));

        assertEquals(List.of(card("J", HEARTS)),
                BeloteRules.legalCards(hand, List.of(card("9", HEARTS), card("10", HEARTS)), Trump.ALL_TRUMPS));
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }

    private static int points(String rank, GameCard.Suit suit, Trump trump) {
        return BeloteRules.points(card(rank, suit), trump);
    }
}
