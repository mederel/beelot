package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GameBoardBotPlayTest {

    private static final GameCard SEVEN_OF_SPADES = new GameCard("7", GameCard.Suit.SPADES);
    private static final GameCard EIGHT_OF_SPADES = new GameCard("8", GameCard.Suit.SPADES);
    private static final GameCard ACE_OF_SPADES = new GameCard("A", GameCard.Suit.SPADES);
    private static final GameCard ACE_OF_CLUBS = new GameCard("A", GameCard.Suit.CLUBS);
    private static final GameCard SEVEN_OF_DIAMONDS = new GameCard("7", GameCard.Suit.DIAMONDS);
    private static final GameCard SEVEN_OF_HEARTS = new GameCard("7", GameCard.Suit.HEARTS);

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ana"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ben"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Chloe"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "David"));

    @Test
    void followsSuitWithoutAnAceWhenTheOpponentsHaveTrumped() {
        GameBoard board = trumpedByOpponent(hand(ACE_OF_SPADES, EIGHT_OF_SPADES));

        board.playAutomatedTurn();

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, EIGHT_OF_SPADES), trick(board));
    }

    @Test
    void discardsAnotherCardThanAnAceWhenTheOpponentsHaveTrumped() {
        GameBoard board = trumpedByOpponent(hand(ACE_OF_CLUBS, SEVEN_OF_DIAMONDS));

        board.playAutomatedTurn();

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, SEVEN_OF_DIAMONDS), trick(board));
    }

    @Test
    void playsTheAceWhenItIsTheOnlyLegalCard() {
        GameBoard board = trumpedByOpponent(hand(ACE_OF_SPADES));

        board.playAutomatedTurn();

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, ACE_OF_SPADES), trick(board));
    }

    /** Ana leads a spade, Ben trumps it, and Chloe's bot must answer with the given hand. */
    private GameBoard trumpedByOpponent(List<GameCard> chloeHand) {
        GameBoard board = GameBoard.fromBidding(players, Map.of(
                players.get(0).playerId(), hand(SEVEN_OF_SPADES),
                players.get(1).playerId(), hand(SEVEN_OF_HEARTS),
                players.get(2).playerId(), chloeHand,
                players.get(3).playerId(), hand(new GameCard("9", GameCard.Suit.SPADES))
        ), GameCard.Suit.HEARTS, 0);
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), SEVEN_OF_HEARTS);
        return board;
    }

    private List<GameCard> trick(GameBoard board) {
        return board.viewFor(players.get(0).playerId()).currentTrick();
    }

    /** Pads the given cards to eight with low clubs and diamonds, none of them spades, trumps or aces. */
    private static List<GameCard> hand(GameCard... cards) {
        List<GameCard> hand = new ArrayList<>(List.of(cards));
        for (String rank : List.of("7", "8", "9", "J", "Q", "K", "10")) {
            for (GameCard.Suit suit : List.of(GameCard.Suit.CLUBS, GameCard.Suit.DIAMONDS)) {
                GameCard filler = new GameCard(rank, suit);
                if (hand.size() < 8 && !hand.contains(filler)) hand.add(filler);
            }
        }
        return hand;
    }
}
