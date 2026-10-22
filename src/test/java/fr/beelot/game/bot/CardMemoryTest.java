package fr.beelot.game.bot;

import fr.beelot.game.Announcement;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Hearts are trump; the bot sits at seat 0 and seats 1 and 3 are its opponents. */
class CardMemoryTest {

    private static final GameCard.Suit SPADES = GameCard.Suit.SPADES;
    private static final GameCard.Suit HEARTS = GameCard.Suit.HEARTS;
    private static final GameCard.Suit CLUBS = GameCard.Suit.CLUBS;
    private static final GameCard.Suit DIAMONDS = GameCard.Suit.DIAMONDS;

    @Test
    void revealedCardsAreKnownUntilPlayed() {
        CardMemory memory = memory(List.of(card("7", CLUBS)), List.of(), List.of(spadeTierce(1)));

        assertEquals(Set.of(card("J", SPADES), card("Q", SPADES), card("K", SPADES)), memory.knownCards(1));
        assertTrue(memory.knownElsewhere(card("K", SPADES), 3));
        assertFalse(memory.knownElsewhere(card("K", SPADES), 1));
    }

    @Test
    void playedRevealedCardIsForgotten() {
        CardMemory memory = memory(List.of(card("7", CLUBS)),
                List.of(trick(1, "J", SPADES, "7", SPADES, "8", SPADES, "9", SPADES)), List.of(spadeTierce(1)));

        assertEquals(Set.of(card("Q", SPADES), card("K", SPADES)), memory.knownCards(1));
    }

    @Test
    void ownRevealedCardsAreNotKnownElsewhere() {
        CardMemory memory = memory(List.of(card("J", SPADES), card("Q", SPADES), card("K", SPADES)), List.of(),
                List.of(spadeTierce(0)));

        assertTrue(memory.knownCards(0).isEmpty());
        assertFalse(memory.knownElsewhere(card("K", SPADES), 1));
    }

    @Test
    void aCardHeldByThePartnerCannotBeatForAnOpponent() {
        List<GameCard> hand = List.of(card("Q", SPADES), card("7", CLUBS));
        List<List<GameBoard.SeatCard>> tricks = List.of(trick(1, "A", SPADES, "10", SPADES, "7", SPADES, "8", SPADES));
        Announcement kings = new Announcement(Announcement.Kind.CARRE, List.of(card("K", SPADES), card("K", HEARTS),
                card("K", CLUBS), card("K", DIAMONDS)), 100, null);
        GameBoard.Declaration partner = new GameBoard.Declaration(2, "South", "North–South", List.of(kings), true);

        assertFalse(memory(hand, tricks, List.of(partner)).mayBeat(1, card("Q", SPADES), SPADES));
        assertFalse(memory(hand, tricks, List.of(partner)).mayBeat(3, card("Q", SPADES), SPADES));
        assertTrue(memory(hand, tricks).mayBeat(1, card("Q", SPADES), SPADES));
    }

    @Test
    void aCardBecomesMasterOnceTheHigherCardsArePlayed() {
        List<GameCard> hand = List.of(card("10", SPADES), card("7", CLUBS));

        assertFalse(memory(hand, List.of()).master(card("10", SPADES)));
        assertTrue(memory(hand, List.of(trick(1, "A", SPADES, "7", SPADES, "8", SPADES, "9", SPADES)))
                .master(card("10", SPADES)));
    }

    @Test
    void theJackIsTheMasterTrump() {
        CardMemory memory = memory(List.of(card("J", HEARTS), card("A", HEARTS)), List.of());

        assertTrue(memory.master(card("J", HEARTS)));
        assertFalse(memory.master(card("A", HEARTS)));
    }

    @Test
    void countsTheTrumpsTheOtherPlayersMayHold() {
        CardMemory memory = memory(List.of(card("J", HEARTS), card("7", CLUBS)),
                List.of(trick(1, "9", HEARTS, "7", HEARTS, "8", HEARTS, "Q", HEARTS)));

        assertEquals(3, memory.remainingTrumps());
    }

    @Test
    void aPlayerWhoDoesNotFollowIsVoidInTheSuitLed() {
        CardMemory memory = memory(List.of(), List.of(trick(1, "7", SPADES, "8", HEARTS, "9", SPADES, "10", SPADES)));

        assertTrue(memory.shownVoid(2, SPADES));
        assertFalse(memory.shownVoid(2, HEARTS));
        assertFalse(memory.shownVoid(3, SPADES));
    }

    @Test
    void aPlayerWhoDiscardsWhileTheOpponentsWinIsVoidInTrumps() {
        CardMemory memory = memory(List.of(), List.of(trick(1, "A", SPADES, "7", CLUBS, "9", SPADES, "10", SPADES)));

        assertTrue(memory.shownVoid(2, SPADES));
        assertTrue(memory.shownVoid(2, HEARTS));
    }

    @Test
    void aPlayerWhoDiscardsOnItsPartnersTrickMayStillHoldTrumps() {
        CardMemory memory = memory(List.of(), List.of(trick(1, "A", SPADES, "7", SPADES, "7", CLUBS, "10", SPADES)));

        assertTrue(memory.shownVoid(3, SPADES));
        assertFalse(memory.shownVoid(3, HEARTS));
    }

    @Test
    void anOpponentVoidInTheSuitLedMayTrumpIt() {
        CardMemory voidInSpades = memory(List.of(card("A", SPADES)),
                List.of(trick(0, "7", SPADES, "7", HEARTS, "8", SPADES, "9", SPADES)));
        CardMemory voidInSpadesAndTrumps = memory(List.of(card("A", SPADES)),
                List.of(trick(0, "7", SPADES, "7", CLUBS, "8", SPADES, "9", SPADES)));

        assertTrue(voidInSpades.mayBeat(1, card("A", SPADES), SPADES));
        assertFalse(voidInSpades.mayBeat(3, card("A", SPADES), SPADES));
        assertFalse(voidInSpadesAndTrumps.mayBeat(1, card("A", SPADES), SPADES));
    }

    private static CardMemory memory(List<GameCard> hand, List<List<GameBoard.SeatCard>> tricks) {
        return memory(hand, tricks, List.of());
    }

    private static CardMemory memory(List<GameCard> hand, List<List<GameBoard.SeatCard>> tricks,
                                     List<GameBoard.Declaration> revealed) {
        return new CardMemory(new GameBoard.PlayView(0, hand, hand, HEARTS, GameVariant.CLASSIC, 0, false, 0, tricks,
                List.of(), true, revealed));
    }

    /** The given seat declared a tierce to the king of spades. */
    private static GameBoard.Declaration spadeTierce(int seat) {
        Announcement tierce = new Announcement(Announcement.Kind.TIERCE, List.of(card("J", SPADES), card("Q", SPADES),
                card("K", SPADES)), 20, SPADES);
        return new GameBoard.Declaration(seat, "Player", seat % 2 == 0 ? "North–South" : "East–West", List.of(tierce),
                true);
    }

    /** A completed trick led from the given seat, each card given as a rank and a suit. */
    private static List<GameBoard.SeatCard> trick(int leader, Object... ranksAndSuits) {
        return java.util.stream.IntStream.range(0, 4).mapToObj(index -> new GameBoard.SeatCard((leader + index) % 4,
                card((String) ranksAndSuits[2 * index], (GameCard.Suit) ranksAndSuits[2 * index + 1]))).toList();
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }
}
