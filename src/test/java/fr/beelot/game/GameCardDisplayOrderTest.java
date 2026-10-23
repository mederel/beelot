package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GameCardDisplayOrderTest {

    @Test
    void ordersNormalSuitFromSevenThroughAce() {
        List<GameCard> cards = cards("A", "10", "K", "Q", "J", "9", "8", "7");

        cards.sort(GameCard.displayOrder(null));

        assertEquals(List.of("7", "8", "9", "J", "Q", "K", "10", "A"), ranks(cards));
    }

    @Test
    void putsTrumpFirstAndUsesTrumpDisplayOrder() {
        List<GameCard> cards = new ArrayList<>(List.of(
                new GameCard("A", GameCard.Suit.CLUBS),
                new GameCard("J", GameCard.Suit.HEARTS),
                new GameCard("7", GameCard.Suit.HEARTS),
                new GameCard("9", GameCard.Suit.HEARTS),
                new GameCard("A", GameCard.Suit.HEARTS),
                new GameCard("10", GameCard.Suit.HEARTS),
                new GameCard("K", GameCard.Suit.HEARTS),
                new GameCard("Q", GameCard.Suit.HEARTS),
                new GameCard("8", GameCard.Suit.HEARTS)));

        cards.sort(GameCard.displayOrder(Trump.HEARTS));

        assertEquals(List.of("7", "8", "Q", "K", "10", "A", "9", "J", "A"), ranks(cards));
        assertEquals(GameCard.Suit.CLUBS, cards.getLast().suit());
    }

    @Test
    void allTrumpsSortsEverySuitInTrumpOrder() {
        List<GameCard> cards = everyCard();

        cards.sort(GameCard.displayOrder(Trump.ALL_TRUMPS));

        assertEquals(sorted(List.of("7", "8", "Q", "K", "10", "A", "9", "J")), cards);
    }

    @Test
    void noTrumpsSortsEverySuitInPlainOrder() {
        List<GameCard> cards = everyCard();

        cards.sort(GameCard.displayOrder(Trump.NO_TRUMPS));

        assertEquals(sorted(List.of("7", "8", "9", "J", "Q", "K", "10", "A")), cards);
    }

    private static List<GameCard> everyCard() {
        List<GameCard> cards = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("J", "A", "7", "10", "Q", "9", "K", "8")) cards.add(new GameCard(rank, suit));
        }
        java.util.Collections.shuffle(cards, new java.util.Random(1));
        return cards;
    }

    /** The cards suit by suit (clubs, diamonds, hearts, spades), each in the given rank order. */
    private static List<GameCard> sorted(List<String> rankOrder) {
        List<GameCard> cards = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : rankOrder) cards.add(new GameCard(rank, suit));
        }
        return cards;
    }

    private static List<GameCard> cards(String... ranks) {
        List<GameCard> cards = new ArrayList<>();
        for (String rank : ranks) cards.add(new GameCard(rank, GameCard.Suit.CLUBS));
        return cards;
    }

    private static List<String> ranks(List<GameCard> cards) {
        return cards.stream().map(GameCard::rank).toList();
    }
}
