package fr.beelot.game;

import fr.beelot.game.bot.BotTurns;
import fr.beelot.game.bot.RuleBasedStrategy;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The rules a board enforces on every play, whoever calls it: turn order, legal cards and the round's steps. */
class GameBoardRulesTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ana"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ben"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Chloe"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "David"));
    private final UUID ana = players.get(0).playerId();
    private final UUID ben = players.get(1).playerId();

    /** Hearts are trump and Ana, to the dealer's left, leads; every player holds two cards of each suit. */
    private final GameBoard board = GameBoard.fromBidding(players, deal(), GameCard.Suit.HEARTS, 0);

    @Test
    void onlyThePlayerWhoseTurnItIsMayPlay() {
        GameCard bensCard = board.viewFor(ben).hand().getFirst();

        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, () -> board.play(ben, bensCard));

        assertEquals("It is not your turn to play.", refused.getMessage());
        assertEquals(8, board.viewFor(ben).hand().size());
        assertEquals(List.of(), board.viewFor(ben).legalCards());
    }

    @Test
    void aPlayerCannotPlayACardTheyDoNotHold() {
        GameCard bensCard = board.viewFor(ben).hand().getFirst();

        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, () -> board.play(ana, bensCard));

        assertEquals("That card is not a legal play.", refused.getMessage());
    }

    @Test
    void aPlayerHoldingTheLedSuitMustFollowIt() {
        board.play(ana, card(ana, GameCard.Suit.SPADES));
        GameCard offSuit = card(ben, GameCard.Suit.CLUBS);

        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, () -> board.play(ben, offSuit));

        assertEquals("That card is not a legal play.", refused.getMessage());
        assertTrue(board.viewFor(ben).legalCards().stream().allMatch(card -> card.suit() == GameCard.Suit.SPADES));
        assertEquals(1, board.viewFor(ben).currentTrick().size());
    }

    @Test
    void someoneWhoIsNotSeatedCannotSeeTheBoard() {
        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, () -> board.viewFor(UUID.randomUUID()));

        assertEquals("You are not seated at this table.", refused.getMessage());
    }

    @Test
    void theGameMovesOnFromATrickOnlyOnceItIsComplete() {
        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, board::continueAfterTrick);

        assertEquals("There is no completed trick to continue from.", refused.getMessage());
    }

    @Test
    void nothingMovesOnOnceTheRoundHasEnded() {
        while (board.viewFor(ana).roundResult() == null) {
            if (board.viewFor(ana).reviewingCompletedTrick()) board.continueAfterTrick();
            else BotTurns.playTurn(board, new RuleBasedStrategy());
        }
        assertNotNull(board.roundSummary());

        PrivateTableConflictException refused =
                assertThrows(PrivateTableConflictException.class, board::continueAfterTrick);

        assertEquals("This round has ended.", refused.getMessage());
    }

    @Test
    void aRoundNeedsFourPlayersWithEightCardsEach() {
        Map<UUID, List<GameCard>> hands = deal();

        assertThrows(IllegalArgumentException.class,
                () -> GameBoard.fromBidding(players.subList(0, 3), hands, GameCard.Suit.HEARTS, 0));
        hands.put(ben, hands.get(ben).subList(0, 7));
        assertThrows(IllegalArgumentException.class,
                () -> GameBoard.fromBidding(players, hands, GameCard.Suit.HEARTS, 0));
        assertThrows(IllegalArgumentException.class,
                () -> GameBoard.fromContract(players, hands, GameCard.Suit.HEARTS, 0, 80, false));
        assertThrows(IllegalArgumentException.class,
                () -> GameBoard.fromContract(players.subList(0, 3), deal(), GameCard.Suit.HEARTS, 0, 80, false));
    }

    @Test
    void aContreeContractIsFrom80To160InStepsOfTen() {
        for (int invalid : List.of(70, 85, 170)) {
            assertThrows(IllegalArgumentException.class,
                    () -> GameBoard.fromContract(players, deal(), GameCard.Suit.HEARTS, 0, invalid, false));
        }

        assertEquals(160, GameBoard.fromContract(players, deal(), GameCard.Suit.HEARTS, 0, 160, false)
                .viewFor(ana).contractValue());
    }

    private GameCard card(UUID player, GameCard.Suit suit) {
        return board.viewFor(player).hand().stream().filter(card -> card.suit() == suit).findFirst().orElseThrow();
    }

    /** Deals the deck one card at a time around the table, so every player holds two cards of each suit. */
    private Map<UUID, List<GameCard>> deal() {
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        players.forEach(player -> hands.put(player.playerId(), new ArrayList<>()));
        int next = 0;
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) {
                hands.get(players.get(next++ % 4).playerId()).add(new GameCard(rank, suit));
            }
        }
        return hands;
    }
}
