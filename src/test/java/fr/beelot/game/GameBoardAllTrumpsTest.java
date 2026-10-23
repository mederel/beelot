package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import static fr.beelot.game.GameCard.Suit.CLUBS;
import static fr.beelot.game.GameCard.Suit.HEARTS;
import static fr.beelot.game.GameCard.Suit.SPADES;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameBoardAllTrumpsTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "North"), new GameBoard.GamePlayer(UUID.randomUUID(), "East"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "South"), new GameBoard.GamePlayer(UUID.randomUUID(), "West"));

    @Test
    void twoBelotesInAllTrumpsBothScore() {
        GameBoard board = board(Trump.ALL_TRUMPS, Map.of(0, List.of(card("K", HEARTS), card("Q", HEARTS)),
                1, List.of(card("K", SPADES), card("Q", SPADES))));

        GameBoard.RoundResult result = playOut(board);

        assertEquals(20, result.northSouthBeloteBonus());
        assertEquals(20, result.eastWestBeloteBonus());
    }

    @Test
    void onePlayerWithTwoBelotesScoresForty() {
        GameBoard board = board(Trump.ALL_TRUMPS, Map.of(0,
                List.of(card("K", HEARTS), card("Q", HEARTS), card("K", CLUBS), card("Q", CLUBS))));

        GameBoard.RoundResult result = playOut(board);

        assertEquals(40, result.northSouthBeloteBonus());
        assertEquals(0, result.eastWestBeloteBonus());
    }

    @Test
    void theBeloteBonusLineCountsTheDeclarersTeam() {
        GameBoard board = board(Trump.ALL_TRUMPS, Map.of(0, List.of(card("K", HEARTS), card("Q", HEARTS)),
                1, List.of(card("K", SPADES), card("Q", SPADES))));
        UUID observer = players.getFirst().playerId();
        boolean rebelote = false;

        while (board.viewFor(observer).roundResult() == null) {
            step(board);
            var view = board.viewFor(observer);
            if (view.declarationMessage().contains("Rebelote")) {
                rebelote = true;
                assertEquals(20, view.beloteBonusPoints(), view.declarationMessage());
            }
        }

        assertTrue(rebelote);
    }

    @Test
    void aPlayerWithTwoBelotesSeesFortyAfterTheSecondRebelote() {
        GameBoard board = board(Trump.ALL_TRUMPS, Map.of(0,
                List.of(card("K", HEARTS), card("Q", HEARTS), card("K", CLUBS), card("Q", CLUBS))));
        UUID observer = players.getFirst().playerId();
        java.util.Set<Integer> bonuses = new java.util.LinkedHashSet<>();

        while (board.viewFor(observer).roundResult() == null) {
            step(board);
            var view = board.viewFor(observer);
            if (view.declarationMessage().contains("Rebelote")) bonuses.add(view.beloteBonusPoints());
        }

        assertEquals(List.of(20, 40), List.copyOf(bonuses));
    }

    @Test
    void noBeloteInNoTrumps() {
        GameBoard board = board(Trump.NO_TRUMPS, Map.of(0, List.of(card("K", HEARTS), card("Q", HEARTS))));
        UUID observer = players.getFirst().playerId();

        while (board.viewFor(observer).roundResult() == null) {
            assertFalse(board.viewFor(observer).declarationMessage().contains("Belote"));
            step(board);
        }

        assertEquals(0, board.viewFor(observer).roundResult().northSouthBeloteBonus());
        assertEquals(0, board.viewFor(observer).roundResult().eastWestBeloteBonus());
        assertFalse(board.viewFor(observer).declarationMessage().contains("Belote"));
    }

    @Test
    void aFullDealTotals162() {
        for (Trump trump : List.of(Trump.ALL_TRUMPS, Trump.NO_TRUMPS)) {
            for (long seed = 0; seed < 5; seed++) {
                GameBoard.RoundResult result = playOut(board(trump, seed));

                assertEquals(162, result.northSouthCardPoints() + result.eastWestCardPoints()
                        + result.northSouthDixDeDer() + result.eastWestDixDeDer(), trump + " seed " + seed);
            }
        }
    }

    /** A deal where the given seats hold the given cards and the rest of the deck is dealt with no other Belote. */
    private GameBoard board(Trump trump, Map<Integer, List<GameCard>> fixed) {
        for (long seed = 0; ; seed++) {
            List<List<GameCard>> deal = deal(fixed, seed);
            boolean onlyAsked = true;
            for (int seat = 0; seat < 4; seat++) {
                onlyAsked &= belotes(deal.get(seat)) == belotes(fixed.getOrDefault(seat, List.of()));
            }
            if (onlyAsked) return board(trump, deal);
        }
    }

    private GameBoard board(Trump trump, long seed) {
        return board(trump, deal(Map.of(), seed));
    }

    private GameBoard board(Trump trump, List<List<GameCard>> deal) {
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int seat = 0; seat < 4; seat++) hands.put(players.get(seat).playerId(), deal.get(seat));
        return GameBoard.fromContract(players, hands, trump, 0, 80, false);
    }

    private static List<List<GameCard>> deal(Map<Integer, List<GameCard>> fixed, long seed) {
        List<GameCard> rest = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) rest.add(card(rank, suit));
        }
        fixed.values().forEach(rest::removeAll);
        Collections.shuffle(rest, new Random(seed));
        List<List<GameCard>> deal = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) {
            List<GameCard> hand = new ArrayList<>(fixed.getOrDefault(seat, List.of()));
            while (hand.size() < 8) hand.add(rest.removeLast());
            deal.add(hand);
        }
        return deal;
    }

    private static long belotes(List<GameCard> hand) {
        return Arrays.stream(GameCard.Suit.values())
                .filter(suit -> hand.contains(card("K", suit)) && hand.contains(card("Q", suit))).count();
    }

    private GameBoard.RoundResult playOut(GameBoard board) {
        UUID observer = players.getFirst().playerId();
        while (board.viewFor(observer).roundResult() == null) step(board);
        return board.viewFor(observer).roundResult();
    }

    private void step(GameBoard board) {
        UUID observer = players.getFirst().playerId();
        if (board.viewFor(observer).reviewingCompletedTrick()) {
            board.continueAfterTrick();
            return;
        }
        UUID active = board.activePlayerId();
        board.play(active, board.playViewFor(active).legalCards().getFirst());
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }
}
