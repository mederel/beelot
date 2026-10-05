package fr.beelot.game.bot;

import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class RuleBasedStrategyPlayTest {

    private static final GameCard SEVEN_OF_SPADES = new GameCard("7", GameCard.Suit.SPADES);
    private static final GameCard EIGHT_OF_SPADES = new GameCard("8", GameCard.Suit.SPADES);
    private static final GameCard NINE_OF_SPADES = new GameCard("9", GameCard.Suit.SPADES);
    private static final GameCard TEN_OF_SPADES = new GameCard("10", GameCard.Suit.SPADES);
    private static final GameCard JACK_OF_SPADES = new GameCard("J", GameCard.Suit.SPADES);
    private static final GameCard ACE_OF_SPADES = new GameCard("A", GameCard.Suit.SPADES);
    private static final GameCard ACE_OF_CLUBS = new GameCard("A", GameCard.Suit.CLUBS);
    private static final GameCard TEN_OF_CLUBS = new GameCard("10", GameCard.Suit.CLUBS);
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

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, EIGHT_OF_SPADES), trick(board));
    }

    @Test
    void discardsAnotherCardThanAnAceWhenTheOpponentsHaveTrumped() {
        GameBoard board = trumpedByOpponent(hand(ACE_OF_CLUBS, SEVEN_OF_DIAMONDS));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, SEVEN_OF_DIAMONDS), trick(board));
    }

    @Test
    void playsTheAceWhenItIsTheOnlyLegalCard() {
        GameBoard board = trumpedByOpponent(hand(ACE_OF_SPADES));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, SEVEN_OF_HEARTS, ACE_OF_SPADES), trick(board));
    }

    @Test
    void leadsALowCardRatherThanATrump() {
        GameBoard board = board(0, hand(SEVEN_OF_HEARTS, EIGHT_OF_SPADES), hand(), hand(), hand());

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(new GameCard("7", GameCard.Suit.CLUBS)), trick(board));
    }

    @Test
    void leadsItsMasterCard() {
        GameBoard board = board(0, hand(SEVEN_OF_DIAMONDS, ACE_OF_SPADES), hand(), hand(), hand());

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(ACE_OF_SPADES), trick(board));
    }

    @Test
    void avoidsLeadingASuitWithTheTenWithoutTheAce() {
        GameBoard board = board(0, hand(TEN_OF_SPADES, SEVEN_OF_SPADES), hand(), hand(), hand());

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(new GameCard("7", GameCard.Suit.CLUBS)), trick(board));
    }

    @Test
    void defenderDoesNotTrumpItsPartnersTrickOnTheFirstTrick() {
        GameBoard board = board(1, hand(ACE_OF_SPADES), hand(SEVEN_OF_SPADES), hand(SEVEN_OF_HEARTS, SEVEN_OF_DIAMONDS),
                hand());
        board.play(players.get(0).playerId(), ACE_OF_SPADES);
        board.play(players.get(1).playerId(), SEVEN_OF_SPADES);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertNotEquals(GameCard.Suit.HEARTS, trick(board).getLast().suit());
    }

    @Test
    void addsItsTenWithoutTheAceToATrickItsPartnerIsSureToWin() {
        GameBoard board = partnerWinsWithTheAce(hand(SEVEN_OF_HEARTS, TEN_OF_CLUBS));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(ACE_OF_SPADES, SEVEN_OF_SPADES, TEN_OF_CLUBS), trick(board));
    }

    @Test
    void keepsItsMasterCardsWhenAddingPointsToItsPartnersTrick() {
        GameBoard board = partnerWinsWithTheAce(hand(ACE_OF_CLUBS, new GameCard("K", GameCard.Suit.DIAMONDS)));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(ACE_OF_SPADES, SEVEN_OF_SPADES, new GameCard("K", GameCard.Suit.DIAMONDS)), trick(board));
    }

    @Test
    void playsLowWhenItsPartnerMayLoseTheTrick() {
        GameCard kingOfSpades = new GameCard("K", GameCard.Suit.SPADES);
        GameBoard board = board(0, hand(kingOfSpades), hand(SEVEN_OF_SPADES), hand(TEN_OF_SPADES, EIGHT_OF_SPADES),
                hand());
        board.play(players.get(0).playerId(), kingOfSpades);
        board.play(players.get(1).playerId(), SEVEN_OF_SPADES);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(kingOfSpades, SEVEN_OF_SPADES, EIGHT_OF_SPADES), trick(board));
    }

    @Test
    void overtrumpsWithItsCheapestWinningTrumpWhenPlayingLast() {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(EIGHT_OF_SPADES), hand(SEVEN_OF_HEARTS),
                hand(new GameCard("J", GameCard.Suit.HEARTS), new GameCard("8", GameCard.Suit.HEARTS)));
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), EIGHT_OF_SPADES);
        board.play(players.get(2).playerId(), SEVEN_OF_HEARTS);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(new GameCard("8", GameCard.Suit.HEARTS), trick(board).getLast());
    }

    @Test
    void defenderTrumpsOnTheFirstTrickWhenItHasNoOtherLegalCard() {
        GameBoard board = board(1, hand(SEVEN_OF_SPADES), hand(EIGHT_OF_SPADES), hand(SEVEN_OF_HEARTS), hand());
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), EIGHT_OF_SPADES);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, EIGHT_OF_SPADES, SEVEN_OF_HEARTS), trick(board));
    }

    @Test
    void followsSuitWithItsLowestValueCardOnATrickTheOpponentsWin() {
        GameBoard board = wonByOpponent(hand(TEN_OF_SPADES, NINE_OF_SPADES));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, ACE_OF_SPADES, NINE_OF_SPADES), trick(board));
    }

    @Test
    void discardsItsLowestValueCardOnATrickTheOpponentsWin() {
        GameBoard board = wonByOpponent(hand(ACE_OF_CLUBS, new GameCard("10", GameCard.Suit.DIAMONDS)));

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, ACE_OF_SPADES, new GameCard("7", GameCard.Suit.CLUBS)), trick(board));
    }

    @Test
    void winsWithACardSureToHoldWhenItCanWinTheTrick() {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(TEN_OF_SPADES), hand(ACE_OF_SPADES, NINE_OF_SPADES),
                hand(EIGHT_OF_SPADES));
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), TEN_OF_SPADES);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, TEN_OF_SPADES, ACE_OF_SPADES), trick(board));
    }

    @Test
    void leadsAnAceWhoseSuitIsNearlyExhausted() {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES, EIGHT_OF_SPADES, NINE_OF_SPADES, TEN_OF_SPADES, JACK_OF_SPADES,
                ACE_OF_SPADES), hand(), hand(), hand());

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(ACE_OF_SPADES), trick(board));
    }

    /** Ben discarded a diamond instead of trumping Ana's trick, so Ben has no trumps left to beat the ace. */
    @Test
    void leadsAnAceAnOpponentVoidInTheSuitCannotTrump() {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(SEVEN_OF_DIAMONDS), hand(TEN_OF_SPADES,
                new GameCard("K", GameCard.Suit.SPADES), ACE_OF_SPADES), hand(EIGHT_OF_SPADES));
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), SEVEN_OF_DIAMONDS);
        board.play(players.get(2).playerId(), TEN_OF_SPADES);
        board.play(players.get(3).playerId(), EIGHT_OF_SPADES);
        board.continueAfterTrick();

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(ACE_OF_SPADES), trick(board));
    }

    @Test
    void winsWithItsCheapestCardSureToWinAndKeepsItsAce() {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(EIGHT_OF_SPADES),
                hand(NINE_OF_SPADES, TEN_OF_SPADES, JACK_OF_SPADES, ACE_OF_SPADES), hand());
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), EIGHT_OF_SPADES);

        BotTurns.playTurn(board, new RuleBasedStrategy());

        assertEquals(List.of(SEVEN_OF_SPADES, EIGHT_OF_SPADES, TEN_OF_SPADES), trick(board));
    }

    /** Ana leads the ace of spades, Ben follows, and Chloe's bot, void in spades, must answer with the given hand. */
    private GameBoard partnerWinsWithTheAce(List<GameCard> chloeHand) {
        GameBoard board = board(1, hand(ACE_OF_SPADES), hand(SEVEN_OF_SPADES), chloeHand, hand());
        board.play(players.get(0).playerId(), ACE_OF_SPADES);
        board.play(players.get(1).playerId(), SEVEN_OF_SPADES);
        return board;
    }

    /** Ana leads a spade, Ben wins it with the ace, and Chloe's bot must answer with the given hand. */
    private GameBoard wonByOpponent(List<GameCard> chloeHand) {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(ACE_OF_SPADES), chloeHand, hand(EIGHT_OF_SPADES));
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), ACE_OF_SPADES);
        return board;
    }

    /** Ana leads a spade, Ben trumps it, and Chloe's bot must answer with the given hand. */
    private GameBoard trumpedByOpponent(List<GameCard> chloeHand) {
        GameBoard board = board(0, hand(SEVEN_OF_SPADES), hand(SEVEN_OF_HEARTS), chloeHand,
                hand(new GameCard("9", GameCard.Suit.SPADES)));
        board.play(players.get(0).playerId(), SEVEN_OF_SPADES);
        board.play(players.get(1).playerId(), SEVEN_OF_HEARTS);
        return board;
    }

    /** Hearts are trump; Ana leads the first trick. */
    private GameBoard board(int declaringPlayerIndex, List<GameCard> ana, List<GameCard> ben, List<GameCard> chloe,
                            List<GameCard> david) {
        return GameBoard.fromBidding(players, Map.of(
                players.get(0).playerId(), ana,
                players.get(1).playerId(), ben,
                players.get(2).playerId(), chloe,
                players.get(3).playerId(), david
        ), GameCard.Suit.HEARTS, declaringPlayerIndex);
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
