package fr.beelot.game;

import fr.beelot.game.Announcement.Kind;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.OptionalInt;

import static fr.beelot.game.GameCard.Suit.CLUBS;
import static fr.beelot.game.GameCard.Suit.DIAMONDS;
import static fr.beelot.game.GameCard.Suit.HEARTS;
import static fr.beelot.game.GameCard.Suit.SPADES;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnnouncementsTest {

    @Test
    void carresScoreByRank() {
        assertCarre("J", 200);
        assertCarre("9", 150);
        for (String rank : List.of("A", "10", "K", "Q")) assertCarre(rank, 100);
    }

    @Test
    void carresOfEightsAndSevensDontCount() {
        assertTrue(Announcements.find(List.of(card("8", CLUBS), card("8", DIAMONDS), card("8", HEARTS),
                card("8", SPADES), card("7", CLUBS), card("7", DIAMONDS), card("7", HEARTS), card("7", SPADES)))
                .isEmpty());
    }

    @Test
    void sequencesByLength() {
        Announcement tierce = single(List.of(card("8", HEARTS), card("9", HEARTS), card("10", HEARTS),
                card("A", CLUBS)));
        assertEquals(Kind.TIERCE, tierce.kind());
        assertEquals(20, tierce.value());
        assertEquals(card("10", HEARTS), tierce.topCard());
        assertEquals(HEARTS, tierce.suit());

        Announcement cinquante = single(List.of(card("9", SPADES), card("10", SPADES), card("J", SPADES),
                card("Q", SPADES)));
        assertEquals(Kind.CINQUANTE, cinquante.kind());
        assertEquals(50, cinquante.value());

        Announcement cent = single(List.of(card("7", DIAMONDS), card("8", DIAMONDS), card("9", DIAMONDS),
                card("10", DIAMONDS), card("J", DIAMONDS)));
        assertEquals(Kind.CENT, cent.kind());
        assertEquals(100, cent.value());

        List<GameCard> allClubs = new ArrayList<>();
        for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) allClubs.add(card(rank, CLUBS));
        Announcement eight = single(allClubs);
        assertEquals(Kind.CENT, eight.kind());
        assertEquals(8, eight.cards().size());
        assertEquals(card("A", CLUBS), eight.topCard());
    }

    @Test
    void sequencesFollowTheNaturalOrderWhateverTheTrump() {
        assertEquals(Kind.TIERCE, single(List.of(card("9", HEARTS), card("10", HEARTS), card("J", HEARTS))).kind());
        assertEquals(card("A", HEARTS),
                single(List.of(card("Q", HEARTS), card("K", HEARTS), card("A", HEARTS))).topCard());
    }

    @Test
    void carreTakesACardASequenceWouldUse() {
        List<Announcement> found = Announcements.find(List.of(card("K", CLUBS), card("K", DIAMONDS),
                card("K", HEARTS), card("K", SPADES), card("Q", HEARTS), card("J", HEARTS)));

        assertEquals(1, found.size());
        assertEquals(Kind.CARRE, found.getFirst().kind());
        assertEquals(null, found.getFirst().suit());
    }

    @Test
    void severalAnnouncementsInOneHand() {
        List<Announcement> found = Announcements.find(List.of(card("7", SPADES), card("8", SPADES),
                card("9", SPADES), card("J", DIAMONDS), card("Q", DIAMONDS), card("K", DIAMONDS),
                card("A", CLUBS), card("7", HEARTS)));

        assertEquals(2, found.size());
        assertEquals(card("K", DIAMONDS), found.get(0).topCard());
        assertEquals(card("9", SPADES), found.get(1).topCard());
    }

    @Test
    void strengthOrder() {
        Announcement centToTheJack = single(List.of(card("7", DIAMONDS), card("8", DIAMONDS), card("9", DIAMONDS),
                card("10", DIAMONDS), card("J", DIAMONDS)));
        Announcement carreOfKings = carre("K");
        Announcement carreOfJacks = carre("J");
        Announcement tierceToTheAce = single(List.of(card("Q", CLUBS), card("K", CLUBS), card("A", CLUBS)));
        Announcement tierceToTheKing = single(List.of(card("J", CLUBS), card("Q", CLUBS), card("K", CLUBS)));
        Announcement trumpTierceToTheKing = single(List.of(card("J", HEARTS), card("Q", HEARTS), card("K", HEARTS)));
        var strength = Announcements.strength(HEARTS);

        assertTrue(strength.compare(centToTheJack, carreOfKings) > 0);
        assertTrue(strength.compare(tierceToTheAce, tierceToTheKing) > 0);
        assertTrue(strength.compare(trumpTierceToTheKing, tierceToTheKing) > 0);
        assertTrue(strength.compare(carreOfJacks, centToTheJack) > 0);
    }

    @Test
    void bestSeatPicksTheStrongestAndTheFirstOnATie() {
        Announcement clubsTierce = single(List.of(card("J", CLUBS), card("Q", CLUBS), card("K", CLUBS)));
        Announcement diamondsTierce = single(List.of(card("J", DIAMONDS), card("Q", DIAMONDS), card("K", DIAMONDS)));
        Announcement cinquante = single(List.of(card("9", SPADES), card("10", SPADES), card("J", SPADES),
                card("Q", SPADES)));
        var first = new Announcements.Declared(1, List.of(clubsTierce));
        var second = new Announcements.Declared(2, List.of(diamondsTierce));

        assertEquals(OptionalInt.of(1), Announcements.bestSeat(List.of(first, second), HEARTS));
        assertEquals(OptionalInt.of(3), Announcements.bestSeat(List.of(first, second,
                new Announcements.Declared(3, List.of(cinquante))), HEARTS));
        assertEquals(OptionalInt.empty(), Announcements.bestSeat(List.of(), HEARTS));
    }

    private static void assertCarre(String rank, int value) {
        Announcement carre = carre(rank);
        assertEquals(Kind.CARRE, carre.kind(), rank);
        assertEquals(value, carre.value(), rank);
    }

    private static Announcement carre(String rank) {
        return single(List.of(card(rank, CLUBS), card(rank, DIAMONDS), card(rank, HEARTS), card(rank, SPADES)));
    }

    private static Announcement single(List<GameCard> hand) {
        List<Announcement> found = Announcements.find(hand);
        assertEquals(1, found.size(), () -> "announcements in " + hand + ": " + found);
        return found.getFirst();
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }
}
