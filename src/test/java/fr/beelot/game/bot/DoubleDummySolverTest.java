package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DoubleDummySolverTest {

    private static final GameCard.Suit HEARTS = GameCard.Suit.HEARTS;
    private static final GameCard.Suit SPADES = GameCard.Suit.SPADES;
    private static final GameCard.Suit CLUBS = GameCard.Suit.CLUBS;
    private static final String[] RANKS = {"7", "8", "9", "10", "J", "Q", "K", "A"};

    private final DoubleDummySolver solver = new DoubleDummySolver();

    @Test
    void theLastTrickScoresItsCardsAndTheDixDeDer() {
        var position = DoubleDummySolver.Position.start(List.of(
                List.of(card("A", SPADES)), List.of(card("7", SPADES)), List.of(card("8", SPADES)),
                List.of(card("10", CLUBS))), HEARTS, 0);

        var solution = solver.solve(position);

        assertEquals(new DoubleDummySolver.Solution(11 + 10 + 10, 0, card("A", SPADES)), solution,
                "North's ace wins the ace, West's discarded ten and the dix de der");
    }

    @Test
    void cashesTheAceBeforeTheKing() {
        // Hearts are trump and North leads. Leading the king lets East's ten win it, and East then trumps the ace:
        // East–West would score all 38 points. Leading the ace forces out the ten, so North–South win 21.
        var position = DoubleDummySolver.Position.start(List.of(
                List.of(card("A", SPADES), card("K", SPADES)),
                List.of(card("10", SPADES), card("7", HEARTS)),
                List.of(card("7", SPADES), card("8", SPADES)),
                List.of(card("9", SPADES), card("Q", SPADES))), HEARTS, 0);

        var solution = solver.solve(position);

        assertEquals(new DoubleDummySolver.Solution(21, 17, card("A", SPADES)), solution);
    }

    @Test
    void countsTheBeloteOfThePlayerDealtTheKingAndQueenOfTrumps() {
        // North played the king of trumps in an earlier trick and still holds the queen.
        List<List<GameBoard.SeatCard>> tricks = List.of(List.of(
                new GameBoard.SeatCard(0, card("K", HEARTS)), new GameBoard.SeatCard(1, card("7", HEARTS)),
                new GameBoard.SeatCard(2, card("8", HEARTS)), new GameBoard.SeatCard(3, card("9", CLUBS))));
        var position = new DoubleDummySolver.Position(List.of(
                List.of(card("Q", HEARTS)), List.of(card("7", CLUBS)), List.of(card("8", CLUBS)),
                List.of(card("10", CLUBS))), HEARTS, tricks, List.of(), 0);

        var solution = solver.solve(position);

        assertEquals(new DoubleDummySolver.Solution(4 + (3 + 10 + 10) + 20, 0, card("Q", HEARTS)), solution,
                "North's king won the first trick (4); the queen wins the last with West's ten and the dix de der,"
                        + " and the belote adds 20");
    }

    @Test
    void solvesFromTheMiddleOfATrick() {
        // North led the ace of spades; East, out of spades and with the partner losing, must trump.
        var position = new DoubleDummySolver.Position(List.of(
                List.of(), List.of(card("7", HEARTS)), List.of(card("8", SPADES)), List.of(card("9", SPADES))),
                HEARTS, List.of(), List.of(new GameBoard.SeatCard(0, card("A", SPADES))), 0);

        var solution = solver.solve(position);

        assertEquals(new DoubleDummySolver.Solution(0, 11 + 10, card("7", HEARTS)), solution);
    }

    @Test
    void reportsTheScoreOfAFinishedRound() {
        var solution = solver.solve(new DoubleDummySolver.Position(List.of(List.of(), List.of(), List.of(), List.of()),
                HEARTS, List.of(), List.of(), 0));

        assertEquals(0, solution.northSouthPoints() + solution.eastWestPoints());
        assertNull(solution.bestCard());
    }

    @Test
    void matchesAnExhaustiveSearchOnRandomEndgames() {
        Random random = new Random(7);
        for (int test = 0; test < 500; test++) {
            int cardsEach = 1 + test % 5;
            GameCard.Suit trump = GameCard.Suit.values()[random.nextInt(4)];
            List<GameCard> deck = deck();
            Collections.shuffle(deck, random);
            List<List<GameCard>> hands = new ArrayList<>();
            for (int seat = 0; seat < 4; seat++) {
                hands.add(new ArrayList<>(deck.subList(seat * cardsEach, (seat + 1) * cardsEach)));
            }
            int leader = random.nextInt(4);
            // Start some positions in the middle of the first trick, with random legal cards.
            List<GameBoard.SeatCard> current = new ArrayList<>();
            int played = test % 3;
            for (int pos = 0; pos < played; pos++) {
                int seat = (leader + pos) % 4;
                List<GameCard> legal = BeloteRules.legalCards(hands.get(seat), cards(current), trump);
                GameCard card = legal.get(random.nextInt(legal.size()));
                hands.get(seat).remove(card);
                current.add(new GameBoard.SeatCard(seat, card));
            }
            var position = new DoubleDummySolver.Position(hands, trump, List.of(), current, leader);

            var solution = solver.solve(position);

            int total = deckPoints(hands, current, trump) + 10 + belote(hands, current, trump);
            int expected = exhaustive(hands, current, leader, trump) + beloteFor(0, hands, current, trump);
            assertEquals(expected, solution.northSouthPoints(), "test " + test);
            assertEquals(total, solution.northSouthPoints() + solution.eastWestPoints(), "test " + test);
            int seat = (leader + current.size()) % 4;
            assertTrue(BeloteRules.legalCards(hands.get(seat), cards(current), trump).contains(solution.bestCard()));
            assertEquals(expected, valueAfter(hands, current, leader, trump, solution.bestCard())
                    + beloteFor(0, hands, current, trump), "the best card achieves the result, test " + test);
        }
    }

    @Test
    void staysExactWhenTheSearchWindowFallsOutsideTheRemainingPoints() {
        // A position from a played round in which the transposition table once stored a lower bound as an upper one.
        GameCard.Suit diamonds = GameCard.Suit.DIAMONDS;
        List<List<GameCard>> hands = List.of(
                List.of(card("K", CLUBS), card("7", SPADES), card("10", diamonds), card("7", HEARTS), card("K", SPADES),
                        card("7", diamonds)),
                List.of(card("A", CLUBS), card("10", CLUBS), card("Q", HEARTS), card("A", HEARTS), card("8", HEARTS),
                        card("8", diamonds)),
                List.of(card("9", HEARTS), card("9", diamonds), card("Q", diamonds), card("J", diamonds), card("9", CLUBS),
                        card("10", HEARTS)),
                List.of(card("7", CLUBS), card("K", HEARTS), card("Q", CLUBS), card("A", diamonds), card("J", CLUBS),
                        card("8", CLUBS), card("K", diamonds)));
        List<GameBoard.SeatCard> current = List.of(new GameBoard.SeatCard(0, card("8", SPADES)),
                new GameBoard.SeatCard(1, card("9", SPADES)), new GameBoard.SeatCard(2, card("J", HEARTS)));

        var solution = solver.solve(new DoubleDummySolver.Position(hands, SPADES, List.of(), current, 0));

        assertEquals(exhaustive(hands, current, 0, SPADES), solution.northSouthPoints());
    }

    @Test
    void solvesAFullDealConsistently() {
        Random random = new Random(3);
        List<GameCard> deck = deck();
        Collections.shuffle(deck, random);
        List<List<GameCard>> hands = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) hands.add(deck.subList(seat * 8, seat * 8 + 8));

        var solution = solver.solve(DoubleDummySolver.Position.start(hands, SPADES, 1));

        assertEquals(162 + belote(hands, List.of(), SPADES), solution.northSouthPoints() + solution.eastWestPoints());
        assertTrue(hands.get(1).contains(solution.bestCard()));
    }

    @Test
    void playingTheSolversCardsInARealRoundGivesThePredictedResult() {
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(java.util.UUID.randomUUID(), "N"),
                new GameBoard.GamePlayer(java.util.UUID.randomUUID(), "E"),
                new GameBoard.GamePlayer(java.util.UUID.randomUUID(), "S"),
                new GameBoard.GamePlayer(java.util.UUID.randomUUID(), "W"));
        Random random = new Random(11);
        for (int deal = 0; deal < 10; deal++) {
            List<GameCard> deck = deck();
            Collections.shuffle(deck, random);
            java.util.Map<java.util.UUID, List<GameCard>> dealt = new java.util.HashMap<>();
            List<List<GameCard>> hands = new ArrayList<>();
            for (int seat = 0; seat < 4; seat++) {
                hands.add(deck.subList(seat * 8, seat * 8 + 8));
                dealt.put(players.get(seat).playerId(), hands.get(seat));
            }
            GameCard.Suit trump = GameCard.Suit.values()[deal % 4];
            int dealer = deal % 4;
            GameBoard board = GameBoard.fromContract(players, dealt, trump, deal % 2, 80, false, dealer);
            var predicted = solver.solve(DoubleDummySolver.Position.start(hands, trump, (dealer + 1) % 4));

            java.util.UUID observer = players.getFirst().playerId();
            while (board.viewFor(observer).roundResult() == null) {
                if (board.viewFor(observer).reviewingCompletedTrick()) {
                    board.continueAfterTrick();
                    continue;
                }
                java.util.UUID player = board.activePlayerId();
                GameBoard.PlayView view = board.playViewFor(player);
                List<List<GameCard>> remaining = new ArrayList<>();
                for (GameBoard.GamePlayer seat : players) remaining.add(board.playViewFor(seat.playerId()).hand());
                var position = new DoubleDummySolver.Position(remaining, trump, view.tricks(), view.currentTrick(),
                        (dealer + 1) % 4);
                var solution = solver.solve(position);
                assertEquals(predicted.northSouthPoints(), solution.northSouthPoints(), "deal " + deal);
                board.play(player, solution.bestCard());
            }
            GameBoard.RoundResult result = board.viewFor(observer).roundResult();
            assertEquals(predicted.northSouthPoints(), result.northSouthCardPoints() + result.northSouthDixDeDer()
                    + result.northSouthBeloteBonus(), "deal " + deal);
            assertEquals(predicted.eastWestPoints(), result.eastWestCardPoints() + result.eastWestDixDeDer()
                    + result.eastWestBeloteBonus(), "deal " + deal);
        }
    }

    private static final java.util.Map<String, Integer> MEMO = new java.util.HashMap<>();

    /** North–South points from the remaining cards, by plain minimax over the rules, remembering each trick start. */
    private static int exhaustive(List<List<GameCard>> hands, List<GameBoard.SeatCard> trick, int leader,
                                  GameCard.Suit trump) {
        if (trick.size() == 4) {
            List<GameCard> trickCards = cards(trick);
            int winner = trick.get(BeloteRules.winningIndex(trickCards, trump)).seat();
            boolean last = hands.stream().allMatch(List::isEmpty);
            int trickPoints = trickCards.stream().mapToInt(card -> BeloteRules.points(card, trump)).sum()
                    + (last ? 10 : 0);
            int gain = winner % 2 == 0 ? trickPoints : 0;
            if (last) return gain;
            String key = trump + " " + winner + " " + hands;
            Integer next = MEMO.get(key);
            if (next == null) {
                next = exhaustive(hands, List.of(), winner, trump);
                MEMO.put(key, next);
            }
            return gain + next;
        }
        int seat = (leader + trick.size()) % 4;
        boolean northSouth = seat % 2 == 0;
        int best = northSouth ? Integer.MIN_VALUE : Integer.MAX_VALUE;
        for (GameCard card : BeloteRules.legalCards(hands.get(seat), cards(trick), trump)) {
            int value = valueAfter(hands, trick, leader, trump, card);
            best = northSouth ? Math.max(best, value) : Math.min(best, value);
        }
        return best;
    }

    private static int valueAfter(List<List<GameCard>> hands, List<GameBoard.SeatCard> trick, int leader,
                                  GameCard.Suit trump, GameCard card) {
        int seat = (leader + trick.size()) % 4;
        List<List<GameCard>> next = new ArrayList<>();
        for (List<GameCard> hand : hands) next.add(new ArrayList<>(hand));
        next.get(seat).remove(card);
        List<GameBoard.SeatCard> nextTrick = new ArrayList<>(trick);
        nextTrick.add(new GameBoard.SeatCard(seat, card));
        return exhaustive(next, nextTrick, trick.isEmpty() ? seat : leader, trump);
    }

    private static int belote(List<List<GameCard>> hands, List<GameBoard.SeatCard> trick, GameCard.Suit trump) {
        return beloteFor(0, hands, trick, trump) + beloteFor(1, hands, trick, trump);
    }

    /** 20 when a player of the given team (0 North–South, 1 East–West) holds or played the king and queen. */
    private static int beloteFor(int team, List<List<GameCard>> hands, List<GameBoard.SeatCard> trick,
                                 GameCard.Suit trump) {
        for (int seat = team; seat < 4; seat += 2) {
            List<GameCard> dealt = new ArrayList<>(hands.get(seat));
            for (GameBoard.SeatCard played : trick) if (played.seat() == seat) dealt.add(played.card());
            if (dealt.contains(card("K", trump)) && dealt.contains(card("Q", trump))) return 20;
        }
        return 0;
    }

    private static int deckPoints(List<List<GameCard>> hands, List<GameBoard.SeatCard> trick, GameCard.Suit trump) {
        int total = cards(trick).stream().mapToInt(card -> BeloteRules.points(card, trump)).sum();
        for (List<GameCard> hand : hands) total += hand.stream().mapToInt(card -> BeloteRules.points(card, trump)).sum();
        return total;
    }

    private static List<GameCard> cards(List<GameBoard.SeatCard> trick) {
        return trick.stream().map(GameBoard.SeatCard::card).toList();
    }

    private static List<GameCard> deck() {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) for (String rank : RANKS) deck.add(new GameCard(rank, suit));
        return deck;
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }
}
